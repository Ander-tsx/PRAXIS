/// <reference types="jest" />

import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { canalDeEventos } from './eventos';
import { PublicadorDeEventos } from './publicador.service';

/**
 * El reparto de eventos en vivo, en prueba.
 *
 * ## Por qué esta pieza y no otra
 *
 * Es donde los fallos han sido **invisibles al compilador**. Todo lo que decide
 * `repartir` —a quién le llega, con qué `peerId`, con qué `mio`— tiene el mismo
 * tipo esté bien o mal: publicar en el canal equivocado, mandar el `peerId` del
 * autor a todo el mundo o marcar `mio` en la copia ajena compilan igual de bien
 * y solo se notan mirando dos navegadores a la vez. Cada bloque de aquí fija una
 * de esas decisiones.
 *
 * ## Sin base de datos ni Redis
 *
 * `PublicadorDeEventos` recibe los dos por constructor y no usa nada más, así
 * que se le pasan dobles. Eso permite además comprobar algo que con una base de
 * verdad no se ve: **cuántas consultas hace**, que es el motivo de que los
 * silenciados se pidan de una vez.
 */
describe('PublicadorDeEventos', () => {
  const CANAL_DIRECTO = 'canal-directo';
  const CANAL_PROYECTO = 'canal-proyecto';
  const ANA = 'usuario-ana';
  const BEA = 'usuario-bea';
  const CARLA = 'usuario-carla';

  /** Lo publicado en esta prueba: `[canal, evento]` por llamada. */
  type Publicado = { canal: string; evento: Record<string, unknown> };

  interface Dobles {
    publicador: PublicadorDeEventos;
    publicado: Publicado[];
    llamadas: { canal: number; miembros: number; silenciados: number };
  }

  /**
   * Monta el publicador sobre dobles.
   *
   * `canal` a `null` simula un `channelId` que no existe — el caso de una
   * conversación borrada entre que se guardó el mensaje y se reparte.
   */
  function montar(opciones: {
    canal: {
      kind: 'DIRECT' | 'PROJECT';
      directUserA?: string | null;
      directUserB?: string | null;
      project?: { id: string; name: string; slug: string } | null;
    } | null;
    miembros?: string[];
    silenciados?: string[];
    redisFalla?: boolean;
  }): Dobles {
    const publicado: Publicado[] = [];
    const llamadas = { canal: 0, miembros: 0, silenciados: 0 };

    const prisma = {
      chatChannel: {
        findUnique: async () => {
          llamadas.canal += 1;
          if (!opciones.canal) return null;
          return {
            id: opciones.canal.kind === 'DIRECT' ? CANAL_DIRECTO : CANAL_PROYECTO,
            kind: opciones.canal.kind,
            directUserA: opciones.canal.directUserA ?? null,
            directUserB: opciones.canal.directUserB ?? null,
            project: opciones.canal.project ?? null,
          };
        },
      },
      projectMember: {
        findMany: async () => {
          llamadas.miembros += 1;
          return (opciones.miembros ?? []).map((userId) => ({ userId }));
        },
      },
      chatChannelState: {
        findMany: async () => {
          llamadas.silenciados += 1;
          return (opciones.silenciados ?? []).map((userId) => ({ userId }));
        },
      },
    } as unknown as PrismaService;

    const redis = {
      publish: async (canal: string, evento: Record<string, unknown>) => {
        if (opciones.redisFalla) throw new Error('Redis caído');
        publicado.push({ canal, evento });
      },
    } as unknown as RedisService;

    return { publicador: new PublicadorDeEventos(prisma, redis), publicado, llamadas };
  }

  /** Un mensaje nuevo, construido como lo hace `ChatService`. */
  const mensajeNuevo =
    (autor: string) =>
    (contexto: {
      destinatario: string;
      silenciado: boolean;
      channelKind: 'PROJECT' | 'DIRECT';
      projectId: string | null;
      projectName: string | null;
      projectSlug: string | null;
      peerId: string | null;
    }) =>
      ({
        tipo: 'chat.mensaje' as const,
        channelId: CANAL_DIRECTO,
        actorId: autor,
        at: '2026-08-17T10:00:00.000Z',
        mensaje: { id: 'mensaje-1', body: 'hola' },
        ...contexto,
      }) as never;

  describe('a quién le llega', () => {
    it('en una conversación privada, a los dos extremos, incluido el autor', async () => {
      /* El autor recibe su propio eco a propósito: puede tener el chat abierto en
         otra pestaña o en el móvil, y sin eco esas sesiones no verían su mensaje
         hasta recargar. Si esto se rompe, el síntoma es «escribo en el portátil y
         en el móvil no aparece», que nadie relaciona con el reparto. */
      const { publicador, publicado } = montar({
        canal: { kind: 'DIRECT', directUserA: ANA, directUserB: BEA },
      });

      await publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA));

      expect(publicado.map((p) => p.canal).sort()).toEqual(
        [canalDeEventos(ANA), canalDeEventos(BEA)].sort(),
      );
    });

    it('en un canal de proyecto, al equipo entero según la base', async () => {
      const { publicador, publicado, llamadas } = montar({
        canal: { kind: 'PROJECT', project: { id: 'p1', name: 'Sprint 1', slug: 'sprint-1' } },
        miembros: [ANA, BEA, CARLA],
      });

      await publicador.repartir(CANAL_PROYECTO, mensajeNuevo(ANA));

      expect(publicado).toHaveLength(3);
      expect(llamadas.miembros).toBe(1);
    });

    it('la lista sale de la base y nunca de quien llama', async () => {
      /* El nombre del canal de Redis es lo único que separa la conexión de una
         persona de la de otra: si un emisor pudiera colar destinatarios, colaría
         mensajes ajenos en la pantalla de cualquiera. `repartir` solo acepta un
         `channelId`, y aquí se comprueba que el equipo que llega es el de la
         base aunque el evento construido diga otra cosa. */
      const { publicador, publicado } = montar({
        canal: { kind: 'PROJECT', project: { id: 'p1', name: 'Sprint 1', slug: 'sprint-1' } },
        miembros: [ANA],
      });

      await publicador.repartir(
        CANAL_PROYECTO,
        () =>
          ({
            tipo: 'chat.mensaje',
            channelId: CANAL_PROYECTO,
            actorId: ANA,
            at: '2026-08-17T10:00:00.000Z',
            mensaje: {},
            channelKind: 'PROJECT',
            projectId: 'p1',
            projectName: 'Sprint 1',
            projectSlug: 'sprint-1',
            peerId: CARLA,
            silenciado: false,
          }) as never,
      );

      expect(publicado.map((p) => p.canal)).toEqual([canalDeEventos(ANA)]);
    });

    it('un canal que ya no existe no publica nada', async () => {
      const { publicador, publicado } = montar({ canal: null });

      await publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA));

      expect(publicado).toHaveLength(0);
    });

    it('un canal privado a medio crear no publica nada', async () => {
      /* `directUserB` nulo es un canal sin el segundo extremo. Sin el filtro,
         `canalDeEventos(null)` publicaría en `eventos:null`, un canal al que
         nadie está suscrito pero que existe: fallo silencioso puro. */
      const { publicador, publicado } = montar({
        canal: { kind: 'DIRECT', directUserA: ANA, directUserB: null },
      });

      await publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA));

      expect(publicado.map((p) => p.canal)).toEqual([canalDeEventos(ANA)]);
    });
  });

  describe('lo que se resuelve por destinatario', () => {
    it('`mio` solo va marcado en la copia del autor', async () => {
      /* Es lo que decide si suena, si sale tarjeta y si el contador sube. Marcado
         de más, nadie se entera de nada; de menos, cada quien se anuncia a sí
         mismo. */
      const { publicador, publicado } = montar({
        canal: { kind: 'DIRECT', directUserA: ANA, directUserB: BEA },
      });

      await publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA));

      const deAna = publicado.find((p) => p.canal === canalDeEventos(ANA));
      const deBea = publicado.find((p) => p.canal === canalDeEventos(BEA));

      expect(deAna?.evento.mio).toBe(true);
      expect(deBea?.evento.mio).toBe(false);
    });

    it('`peerId` es la otra persona vista desde cada destinatario', async () => {
      /* Un solo valor para los dos mandaría a uno de ellos a su propia
         conversación consigo mismo. */
      const { publicador, publicado } = montar({
        canal: { kind: 'DIRECT', directUserA: ANA, directUserB: BEA },
      });

      await publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA));

      expect(publicado.find((p) => p.canal === canalDeEventos(ANA))?.evento.peerId).toBe(BEA);
      expect(publicado.find((p) => p.canal === canalDeEventos(BEA))?.evento.peerId).toBe(ANA);
    });

    it('en un canal de proyecto no hay interlocutor', async () => {
      const { publicador, publicado } = montar({
        canal: { kind: 'PROJECT', project: { id: 'p1', name: 'Sprint 1', slug: 'sprint-1' } },
        miembros: [ANA, BEA],
      });

      await publicador.repartir(CANAL_PROYECTO, mensajeNuevo(ANA));

      for (const { evento } of publicado) expect(evento.peerId).toBeNull();
    });
  });

  describe('silenciar', () => {
    it('quien lo tiene silenciado **recibe** el evento, marcado', async () => {
      /* Antes no se le mandaba nada, y estaba bien cuando el evento solo servía
         para pitar. Ahora lleva el mensaje dentro: no mandarlo dejaría una
         conversación silenciada sin actualizarse sola, que no es lo que nadie
         entiende por «silenciar». */
      const { publicador, publicado } = montar({
        canal: { kind: 'DIRECT', directUserA: ANA, directUserB: BEA },
        silenciados: [BEA],
      });

      await publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA));

      expect(publicado.find((p) => p.canal === canalDeEventos(BEA))?.evento.silenciado).toBe(true);
      expect(publicado.find((p) => p.canal === canalDeEventos(ANA))?.evento.silenciado).toBe(false);
    });

    it('los silenciados se piden en una sola consulta', async () => {
      /* Una por persona serían veinte viajes a la base por cada mensaje del chat
         de un equipo. Esto es lo único que lo fija: el código con una consulta
         por destinatario funcionaría igual y solo se notaría bajo carga. */
      const { publicador, llamadas } = montar({
        canal: { kind: 'PROJECT', project: { id: 'p1', name: 'Sprint 1', slug: 'sprint-1' } },
        miembros: [ANA, BEA, CARLA],
      });

      await publicador.repartir(CANAL_PROYECTO, mensajeNuevo(ANA));

      expect(llamadas.silenciados).toBe(1);
    });
  });

  describe('nunca tumba lo que ya está guardado', () => {
    it('si Redis está caído, ni lanza ni deja un rechazo suelto', async () => {
      /* Publicar es una capa encima de la bandeja. El mensaje ya está en la base
         cuando se llega aquí: que el tiempo real se degrade no puede convertir un
         envío correcto en un 500.

         ⚠️ **Y esta prueba encontró un fallo de verdad.** El reparto hacía
         `void this.redis.publish(...)`: no se espera, así que el `try/catch` no
         lo cubre y el rechazo llegaba a `unhandledRejection` —que **mata el
         proceso** en Node—. No se veía porque `RedisService.publish` traga sus
         propios errores; el doble de aquí no, y el proceso de Jest se cayó en
         seco. Por eso se vigila el `unhandledRejection` explícitamente: sin esto,
         la prueba pasaría con el fallo dentro. */
      const sueltos: unknown[] = [];
      const vigilar = (razon: unknown) => sueltos.push(razon);
      process.on('unhandledRejection', vigilar);

      try {
        const { publicador } = montar({
          canal: { kind: 'DIRECT', directUserA: ANA, directUserB: BEA },
          redisFalla: true,
        });

        await expect(
          publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA)),
        ).resolves.toBeUndefined();

        /* Un turno de microtareas y otro de macrotareas: es cuando Node decide
           que un rechazo se quedó sin quien lo escuchara. */
        await new Promise((listo) => setImmediate(listo));

        expect(sueltos).toEqual([]);
      } finally {
        process.off('unhandledRejection', vigilar);
      }
    });

    it('si la consulta del canal falla, no lanza', async () => {
      const prisma = {
        chatChannel: {
          findUnique: async () => {
            throw new Error('base caída');
          },
        },
      } as unknown as PrismaService;
      const redis = { publish: async () => undefined } as unknown as RedisService;

      const publicador = new PublicadorDeEventos(prisma, redis);

      await expect(publicador.repartir(CANAL_DIRECTO, mensajeNuevo(ANA))).resolves.toBeUndefined();
    });
  });
});
