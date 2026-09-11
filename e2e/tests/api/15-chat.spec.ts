import { type APIRequestContext, expect, test } from '@playwright/test';
import {
  type Usuario,
  comoBearer,
  crearProyecto,
  data,
  error,
  nombreUnico,
  registrar,
} from '../../fixtures/api';

/**
 * El chat, por la API.
 *
 * ## Por qué existe este archivo
 *
 * Hasta ahora **no había ni una prueba del chat**, justo mientras se reescribía
 * entero: borrado suave, tope de fijados, respuestas de hilo fuera del
 * historial, reanudación por `after`. Todo eso son reglas que el compilador no
 * puede comprobar y que fallan en silencio — un mensaje que reaparece, una barra
 * de fijados que se llena de huecos, un hilo que se cuela en la conversación.
 *
 * ## Lo que se prueba y lo que no
 *
 * Se prueba por la **conversación privada**, no por la de proyecto: las dos
 * comparten el mismo servicio y las mismas reglas (`ChatService` no distingue,
 * solo recibe un `channelId`), y la privada se monta con dos cuentas en lugar de
 * con roles y permisos. Lo específico del canal de proyecto —que es la
 * autorización— ya lo cubre `03-autorizacion`.
 *
 * ⚠️ **Cada prueba estrena interlocutor.** Una conversación privada entre dos
 * cuentas es **un solo canal**, así que reutilizar la pareja arrastraría los
 * fijados, los no leídos y las lápidas de la prueba anterior. Se registra una
 * cuenta nueva por prueba y se le da de alta en el mismo proyecto —que es lo que
 * habilita el privado— en vez de registrar dos: el alta cuesta un login, y el
 * límite de `/auth/login` es de diez por minuto para toda la suite.
 */

/** Los campos de un mensaje que estas pruebas miran. */
interface Mensaje {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  pinnedAt: string | null;
  visibleEnChat: boolean;
  deletedAt: string | null;
  reactions: { emoji: string; userId: string }[];
  attachments: { id: string }[];
  replyTo: { id: string; body: string; deletedAt: string | null } | null;
}

/** Lo que devuelve el listado de mensajes. */
interface Pagina {
  channelId: string;
  items: Mensaje[];
  /** Queda historial hacia **arriba**. */
  hasMore: boolean;
  /** Solo en `?after=`: el hueco venía recortado y falta algo hacia **abajo**. */
  hasMoreAfter?: boolean;
  unread: number;
  muted: boolean;
}

/** El dueño del proyecto y su proyecto: lo único que se comparte entre pruebas. */
let duenno: Usuario;
let proyectoId: string;
/**
 * La organización personal del dueño, que es de donde salen los asientos.
 *
 * 🔴 **Los asientos son el producto, y este archivo los gasta.** Desde la etapa
 * de organizaciones, entrar en un proyecto exige asiento en la organización que
 * lo contiene: el plan gratuito da **tres** —el dueño y dos más—, y cada
 * interlocutor que crea una prueba ocupa uno al darse de alta. Con diecisiete
 * pruebas sobre el mismo proyecto, a partir de la tercera todas fallaban con
 * `403 NOT_IN_ORG` por el modelo de precios y no por el chat.
 *
 * Por eso se sueltan al terminar cada prueba (ver el `afterEach`): la
 * conversación de cada una sigue naciendo limpia —que es lo que hace legibles
 * las de paginación— sin pedirle al plan más de lo que da.
 */
let organizacionId: string;

/** Quién ocupa asiento ahora mismo por culpa de la prueba en curso. */
let prestados: Usuario[] = [];

test.beforeAll(async ({ playwright }) => {
  /* `request` es de ámbito de prueba, así que el montaje compartido necesita su
     propio contexto. Se apunta al mismo destino que el proyecto `api`. */
  const contexto = await playwright.request.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });

  duenno = await registrar(contexto);
  proyectoId = (await crearProyecto(contexto, duenno.accessToken)).id;

  const mias = await data<{ id: string; kind: string }[]>(
    await contexto.get('/api/me/organizations', { headers: comoBearer(duenno.accessToken) }),
  );
  const personal = mias.find((organizacion) => organizacion.kind === 'PERSONAL') ?? mias[0];
  expect(personal, 'Quien se registra tiene su espacio personal desde el primer día').toBeTruthy();
  organizacionId = personal.id;

  await contexto.dispose();
});

/**
 * Devuelve los asientos que ha ocupado la prueba que acaba de terminar.
 *
 * Sacar a alguien de la organización lo saca también de los proyectos de esa
 * organización, que es justo lo que se quiere: la prueba ya ha comprobado lo
 * suyo y la siguiente necesita el hueco.
 */
test.afterEach(async ({ request }) => {
  for (const invitado of prestados) {
    await request.delete(`/api/organizations/${organizacionId}/members/${invitado.userId}`, {
      headers: comoBearer(duenno.accessToken),
    });
  }
  prestados = [];
});

/**
 * Una cuenta nueva dada de alta en el proyecto del dueño.
 *
 * Compartir proyecto es **el requisito** de la conversación privada: sin esto,
 * `ChannelsService.directo()` no resuelve el canal y todo responde 403. No es un
 * detalle de montaje, es la regla que impide que la plataforma sea mensajería
 * abierta.
 */
async function nuevoInterlocutor(request: APIRequestContext): Promise<Usuario> {
  const invitado = await registrar(request);
  const delDuenno = comoBearer(duenno.accessToken);

  const rol = await request.post(`/api/projects/${proyectoId}/roles`, {
    headers: delDuenno,
    data: {
      name: nombreUnico('Rol').slice(0, 50),
      /* Diccionario de booleanos, nunca un array: un array se acepta con 201 y
         no concede nada. */
      permissions: { canViewProject: true, canComment: true },
    },
  });
  expect(rol.status(), 'Crear rol de proyecto').toBe(201);

  const alta = await request.post(`/api/projects/${proyectoId}/members`, {
    headers: delDuenno,
    data: { userId: invitado.userId, projectRoleId: (await data<{ id: string }>(rol)).id },
  });
  expect(alta.status(), 'Dar de alta al miembro').toBe(201);

  /* Ocupa un asiento desde este momento. El `afterEach` lo devuelve. */
  prestados.push(invitado);

  return invitado;
}

/** Escribe en la conversación privada y devuelve el mensaje creado. */
async function escribir(
  request: APIRequestContext,
  quien: Usuario,
  aQuien: Usuario,
  cuerpo: string,
  extra: { replyToId?: string; enHilo?: boolean } = {},
): Promise<Mensaje> {
  const respuesta = await request.post(conversacionDe(quien, aQuien, '/messages'), {
    headers: comoBearer(quien.accessToken),
    data: { body: cuerpo, ...extra },
  });
  expect(respuesta.status(), `Escribir «${cuerpo}»`).toBe(201);
  return data<Mensaje>(respuesta);
}

/**
 * La ruta de una conversación privada **vista desde quien la pide**.
 *
 * ⚠️ El `peerId` de la URL es *la otra persona*, así que cambia según quién
 * llame: el mismo canal es `/me/chats/<bea>` para Ana y `/me/chats/<ana>` para
 * Bea. Escribirlo a mano en cada petición ya salió mal aquí —dos pruebas
 * pedían `/me/chats/<yo>` con mi propio token, que es una conversación conmigo
 * misma— y el 400 resultante se confundió con un fallo del sistema. Con esta
 * función no se puede escribir mal.
 */
function conversacionDe(quien: Usuario, aQuien: Usuario, sufijo = ''): string {
  expect(
    aQuien.userId,
    'El `peerId` de la ruta es la OTRA persona, no quien lleva el token',
  ).not.toBe(quien.userId);
  return `/api/me/chats/${aQuien.userId}${sufijo}`;
}

/** Lee la conversación privada tal y como la ve `quien`. */
async function leer(
  request: APIRequestContext,
  quien: Usuario,
  aQuien: Usuario,
  query: Record<string, string | number | boolean> = {},
): Promise<Pagina> {
  const respuesta = await request.get(conversacionDe(quien, aQuien, '/messages'), {
    headers: comoBearer(quien.accessToken),
    params: query,
  });
  expect(respuesta.status(), 'Listar mensajes').toBe(200);
  return data<Pagina>(respuesta);
}

test.describe('Chat — enviar y listar', () => {
  test('un mensaje enviado sale en la conversación de los dos', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const enviado = await escribir(request, duenno, otra, 'hola');

    const desdeQuienEscribe = await leer(request, duenno, otra);
    const desdeQuienRecibe = await leer(request, otra, duenno);

    expect(desdeQuienEscribe.items.map((m) => m.id)).toContain(enviado.id);
    expect(desdeQuienRecibe.items.map((m) => m.id)).toContain(enviado.id);

    /* El canal viaja en la respuesta y es **el mismo para los dos extremos**: es
       lo único que significa lo mismo a ambos lados, y con lo que el cliente
       decide si un evento en vivo le incumbe. Si aquí salieran dos canales
       distintos, el tiempo real dejaría de funcionar sin que nada fallara. */
    expect(desdeQuienEscribe.channelId).toBe(desdeQuienRecibe.channelId);
  });

  test('el historial llega del más antiguo al más nuevo', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    for (const texto of ['uno', 'dos', 'tres']) {
      await escribir(request, duenno, otra, texto);
    }

    const pagina = await leer(request, duenno, otra);

    /* ⚠️ **Ascendente**, aunque por dentro se consulte al revés. El servicio
       pide los `limit + 1` más recientes —que es lo que permite paginar hacia
       arriba— y le da la vuelta antes de responder, porque un chat se pinta de
       arriba abajo. La distinción importa: `items[0]` es el **más antiguo** de
       la página, y es el que hay que pasar como `before` para seguir subiendo. */
    expect(pagina.items.map((m) => m.body)).toEqual(['uno', 'dos', 'tres']);
  });

  test('un mensaje sin texto ni adjuntos se rechaza', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const respuesta = await request.post(conversacionDe(duenno, otra, '/messages'), {
      headers: comoBearer(duenno.accessToken),
      data: { body: '   ' },
    });

    expect(respuesta.status()).toBe(400);
  });
});

test.describe('Chat — paginación', () => {
  test('`before` sube por el historial y `hasMore` avisa de que queda más', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const escritos: Mensaje[] = [];
    for (let i = 1; i <= 5; i += 1) {
      escritos.push(await escribir(request, duenno, otra, `mensaje ${i}`));
    }

    const primera = await leer(request, duenno, otra, { limit: 2 });
    /* La página son los dos más recientes, servidos en orden de lectura. */
    expect(primera.items.map((m) => m.body)).toEqual(['mensaje 4', 'mensaje 5']);
    /* `hasMore` se calcula pidiendo uno de más, no contando la tabla. Si se
       rompiera, el chat dejaría de cargar historial al subir y no habría error. */
    expect(primera.hasMore).toBe(true);

    /* El cursor es el **primero** de la página, que en orden ascendente es el
       más antiguo: es el borde por el que se sigue subiendo. */
    const segunda = await leer(request, duenno, otra, { limit: 2, before: primera.items[0].id });
    expect(segunda.items.map((m) => m.body)).toEqual(['mensaje 2', 'mensaje 3']);

    const tercera = await leer(request, duenno, otra, { limit: 2, before: segunda.items[0].id });
    expect(tercera.items.map((m) => m.body)).toEqual(['mensaje 1']);
    expect(tercera.hasMore).toBe(false);
    expect(escritos).toHaveLength(5);
  });

  test('`after` baja por lo que se perdió, en orden ascendente', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const primero = await escribir(request, duenno, otra, 'antes del corte');
    await escribir(request, otra, duenno, 'durante el corte 1');
    await escribir(request, otra, duenno, 'durante el corte 2');

    /* Es la reanudación tras una desconexión: el cliente tiene el último que vio
       y pide el hueco de una sola vez. Ascendente a propósito, porque se
       añade al final de lo que ya está pintado. */
    const hueco = await leer(request, duenno, otra, { after: primero.id });

    expect(hueco.items.map((m) => m.body)).toEqual(['durante el corte 1', 'durante el corte 2']);
  });

  test('un hueco que no cabe lo dice con `hasMoreAfter`', async ({ request }) => {
    /* 🔴 El caso que se perdía en silencio. El servidor recorta el hueco al
       tope, y antes no lo decía: el cliente pegaba el trozo recibido al final de
       lo que ya tenía y **lo de en medio desaparecía para siempre**, sin error
       ninguno. Solo pasa tras un corte largo —un portátil cerrado media hora en
       un chat activo—, que es justo cuando nadie sospecha de la aplicación. */
    const otra = await nuevoInterlocutor(request);

    const ancla = await escribir(request, duenno, otra, 'antes del corte');
    for (let i = 1; i <= 4; i += 1) {
      await escribir(request, otra, duenno, `durante ${i}`);
    }

    /* Con tope 2 y cuatro mensajes por delante, el hueco desborda. */
    const recortado = await leer(request, duenno, otra, { after: ancla.id, limit: 2 });
    expect(recortado.items.map((m) => m.body)).toEqual(['durante 1', 'durante 2']);
    expect(recortado.hasMoreAfter, 'El hueco no cabía y tiene que decirlo').toBe(true);

    /* Y cuando sí cabe, no alarma: `false`, no ausente. Un cliente que compare
       contra `undefined` se comportaría igual, pero el contrato tiene que ser
       explícito. */
    const completo = await leer(request, duenno, otra, { after: ancla.id, limit: 50 });
    expect(completo.items).toHaveLength(4);
    expect(completo.hasMoreAfter).toBe(false);

    /* ⚠️ `hasMore` se queda en `false` en las dos: significa «queda más hacia
       **arriba**», que es lo contrario de lo que pasa aquí. Son campos
       distintos a propósito. */
    expect(recortado.hasMore).toBe(false);
    expect(completo.hasMore).toBe(false);
  });

  test('un cursor de otra conversación no filtra nada', async ({ request }) => {
    /* El caso que importa: `before` y `after` son ids de mensaje, y un id ajeno
       que se conozca no puede convertirse en una ventana a un chat ajeno. */
    const unaPersona = await nuevoInterlocutor(request);
    const otraPersona = await nuevoInterlocutor(request);

    const ajeno = await escribir(request, duenno, otraPersona, 'esto es de otra conversación');
    await escribir(request, duenno, unaPersona, 'esto sí es de aquí');

    const conBeforeAjeno = await leer(request, duenno, unaPersona, { before: ajeno.id });
    const conAfterAjeno = await leer(request, duenno, unaPersona, { after: ajeno.id });

    for (const pagina of [conBeforeAjeno, conAfterAjeno]) {
      expect(pagina.items.map((m) => m.body)).not.toContain('esto es de otra conversación');
    }

    /* ⚠️ Las dos rutas se defienden, pero **no igual**, y conviene que quede
       escrito: `before` ignora el cursor ajeno y devuelve la primera página
       normal; `after` devuelve la lista vacía. Ninguna filtra, que es lo que
       importa, pero un cliente que dependa de una forma concreta se llevará una
       sorpresa según cuál use. */
    expect(conBeforeAjeno.items.map((m) => m.body)).toContain('esto sí es de aquí');
    expect(conAfterAjeno.items).toEqual([]);
  });
});

test.describe('Chat — borrado suave', () => {
  test('borrar deja la lápida: la fila se queda, vacía y sin nada colgando', async ({
    request,
  }) => {
    const otra = await nuevoInterlocutor(request);

    const mensaje = await escribir(request, duenno, otra, 'esto se va a borrar');

    /* Se le cuelga todo lo que un borrado tiene que llevarse por delante. La
       reacción la pone la otra persona, así que su ruta lleva al dueño. */
    const reaccion = await request.post(
      conversacionDe(otra, duenno, `/messages/${mensaje.id}/react`),
      { headers: comoBearer(otra.accessToken), data: { emoji: '👍', on: true } },
    );
    expect(reaccion.status()).toBe(200);

    const fijar = await request.post(conversacionDe(duenno, otra, `/messages/${mensaje.id}/pin`), {
      headers: comoBearer(duenno.accessToken),
      data: { on: true },
    });
    expect(fijar.status()).toBe(200);

    const borrado = await request.delete(conversacionDe(duenno, otra, `/messages/${mensaje.id}`), {
      headers: comoBearer(duenno.accessToken),
    });
    expect(borrado.status()).toBe(200);

    const pagina = await leer(request, duenno, otra);
    const lapida = pagina.items.find((m) => m.id === mensaje.id);

    /* La fila **se queda**. Era un `deleteMany` y desaparecía, y eso en una
       conversación es un hueco mudo: quien la lee no sabe si alguien borró algo,
       si falló la carga o si nunca hubo nada. */
    expect(lapida, 'La fila del mensaje borrado tiene que seguir ahí').toBeDefined();
    expect(lapida?.deletedAt).not.toBeNull();
    expect(lapida?.body).toBe('');
    expect(lapida?.reactions).toEqual([]);
    expect(lapida?.attachments).toEqual([]);
    /* Y se desfija en el mismo gesto: un anclaje a un hueco se quedaría en la
       barra para siempre, gastando una de las cinco plazas. */
    expect(lapida?.pinnedAt).toBeNull();

    const fijados = await leer(request, duenno, otra, { pinned: true });
    expect(fijados.items.map((m) => m.id)).not.toContain(mensaje.id);
  });

  test('una lápida no se edita, no se reacciona, no se fija y no se cita', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const mensaje = await escribir(request, duenno, otra, 'adiós');
    const borrado = await request.delete(conversacionDe(duenno, otra, `/messages/${mensaje.id}`), {
      headers: comoBearer(duenno.accessToken),
    });
    expect(borrado.status()).toBe(200);

    const editar = await request.patch(conversacionDe(duenno, otra, `/messages/${mensaje.id}`), {
      headers: comoBearer(duenno.accessToken),
      data: { body: 'resucitado' },
    });
    /* Editar una lápida la resucitaría con texto nuevo, que es exactamente lo
       que un borrado tiene que impedir. */
    expect(editar.status(), 'Editar una lápida').toBe(404);

    const reaccionar = await request.post(
      conversacionDe(otra, duenno, `/messages/${mensaje.id}/react`),
      { headers: comoBearer(otra.accessToken), data: { emoji: '👍', on: true } },
    );
    expect(reaccionar.status(), 'Reaccionar a una lápida').toBe(404);

    const fijar = await request.post(conversacionDe(duenno, otra, `/messages/${mensaje.id}/pin`), {
      headers: comoBearer(duenno.accessToken),
      data: { on: true },
    });
    expect(fijar.status(), 'Fijar una lápida').toBe(404);

    const citar = await request.post(conversacionDe(otra, duenno, '/messages'), {
      headers: comoBearer(otra.accessToken),
      data: { body: 'te contesto', replyToId: mensaje.id },
    });
    /* Aquí sí es 400 y no 404: el mensaje existe y se ve, lo que no vale es la
       petición. La cita saldría vacía y quien responde creería estar
       contestando a algo que ya no está. */
    expect(citar.status(), 'Citar una lápida').toBe(400);
  });

  test('borrar el mensaje de otra persona no encuentra fila', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const mensaje = await escribir(request, duenno, otra, 'esto es mío');

    const intento = await request.delete(conversacionDe(otra, duenno, `/messages/${mensaje.id}`), {
      headers: comoBearer(otra.accessToken),
    });

    /* En privado no hay moderación. Y responde 404, no 403: no se confirma la
       existencia de un mensaje que no puedes tocar. */
    expect(intento.status()).toBe(404);

    const pagina = await leer(request, duenno, otra);
    expect(pagina.items.find((m) => m.id === mensaje.id)?.deletedAt).toBeNull();
  });
});

test.describe('Chat — fijados', () => {
  test('el sexto fijado se rechaza con 400 y el tope aguanta', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const mensajes: Mensaje[] = [];
    for (let i = 1; i <= 6; i += 1) {
      mensajes.push(await escribir(request, duenno, otra, `candidato ${i}`));
    }

    for (const mensaje of mensajes.slice(0, 5)) {
      const respuesta = await request.post(
        conversacionDe(duenno, otra, `/messages/${mensaje.id}/pin`),
        { headers: comoBearer(duenno.accessToken), data: { on: true } },
      );
      expect(respuesta.status(), `Fijar «${mensaje.body}»`).toBe(200);
    }

    const sexto = await request.post(
      conversacionDe(duenno, otra, `/messages/${mensajes[5].id}/pin`),
      { headers: comoBearer(duenno.accessToken), data: { on: true } },
    );

    expect(sexto.status(), 'El sexto fijado').toBe(400);
    expect((await error(sexto)).message).toContain('5');

    const fijados = await leer(request, duenno, otra, { pinned: true });
    expect(fijados.items).toHaveLength(5);

    /* El tope se aplica en el servidor **y por eso importa esta prueba**: dos
       pestañas fijando a la vez, o cualquiera llamando a la ruta a mano, se
       saltarían un límite que solo viviera en la interfaz. */
    const desfijar = await request.post(
      conversacionDe(duenno, otra, `/messages/${mensajes[0].id}/pin`),
      { headers: comoBearer(duenno.accessToken), data: { on: false } },
    );
    expect(desfijar.status()).toBe(200);

    const ahoraSi = await request.post(
      conversacionDe(duenno, otra, `/messages/${mensajes[5].id}/pin`),
      { headers: comoBearer(duenno.accessToken), data: { on: true } },
    );
    expect(ahoraSi.status(), 'Tras desfijar, cabe otro').toBe(200);
  });
});

test.describe('Chat — hilos', () => {
  test('una respuesta de hilo no sale en el historial general', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const raiz = await escribir(request, duenno, otra, 'abro un tema');
    const enHilo = await escribir(request, otra, duenno, 'contesto dentro del hilo', {
      replyToId: raiz.id,
      enHilo: true,
    });

    const historial = await leer(request, duenno, otra);

    /* «Responder» y «abrir el hilo» llevan los dos cita, pero solo lo que se
       escribe dentro del panel se guarda con `visibleEnChat: false`. Sin esto,
       una respuesta de hilo aparecía en medio de la conversación general. */
    expect(historial.items.map((m) => m.id)).toContain(raiz.id);
    expect(historial.items.map((m) => m.id)).not.toContain(enHilo.id);
    expect(enHilo.visibleEnChat).toBe(false);
  });

  test('una respuesta desde el compositor principal sí fluye en la conversación', async ({
    request,
  }) => {
    const otra = await nuevoInterlocutor(request);

    const raiz = await escribir(request, duenno, otra, 'pregunto');
    const citando = await escribir(request, otra, duenno, 'contesto citando', {
      replyToId: raiz.id,
    });

    const historial = await leer(request, duenno, otra);

    expect(historial.items.map((m) => m.id)).toContain(citando.id);
    expect(citando.visibleEnChat).toBe(true);
    expect(citando.replyTo?.id).toBe(raiz.id);
  });

  test('el hilo devuelve la raíz y sus respuestas', async ({ request }) => {
    const otra = await nuevoInterlocutor(request);

    const raiz = await escribir(request, duenno, otra, 'tema del hilo');
    const respuesta = await escribir(request, otra, duenno, 'una respuesta', {
      replyToId: raiz.id,
      enHilo: true,
    });

    const hilo = await request.get(conversacionDe(duenno, otra, `/messages/${raiz.id}/thread`), {
      headers: comoBearer(duenno.accessToken),
    });
    expect(hilo.status()).toBe(200);

    const contenido = await data<{ root: Mensaje; replies: Mensaje[] }>(hilo);
    expect(contenido.root.id).toBe(raiz.id);
    expect(contenido.replies.map((m) => m.id)).toEqual([respuesta.id]);
  });
});

test.describe('Chat — no leídos', () => {
  test('sube con lo ajeno, no con lo propio, y se pone a cero al marcar leído', async ({
    request,
  }) => {
    const otra = await nuevoInterlocutor(request);

    /* Lo propio no cuenta: si contara, escribir dejaría tu propia conversación
       con la insignia puesta. Para la otra parte sí sube. */
    await escribir(request, duenno, otra, 'escribo yo');
    expect((await leer(request, duenno, otra)).unread).toBe(0);
    expect((await leer(request, otra, duenno)).unread).toBe(1);

    /* ⚠️ **Escribir adelanta tu propia marca de lectura**, y hay que probarlo
       aquí porque es lo que hace que el contador de la otra parte se ponga a
       cero sin que nadie llame a `/read`: quien contesta estaba leyendo, y una
       insignia que sobrevive a haber respondido es la que la gente reporta como
       «no se me quita». Listar **no** la adelanta, a propósito: abrir la
       conversación no es haberla leído hasta el final. */
    await escribir(request, otra, duenno, 'te escribo');
    await escribir(request, otra, duenno, 'y otra vez');
    expect((await leer(request, otra, duenno)).unread).toBe(0);

    expect((await leer(request, duenno, otra)).unread).toBe(2);

    /* Y listar tampoco la adelanta: si lo hiciera, el 2 de arriba ya sería 0. */
    expect((await leer(request, duenno, otra)).unread).toBe(2);

    const marcar = await request.post(conversacionDe(duenno, otra, '/read'), {
      headers: comoBearer(duenno.accessToken),
    });
    expect(marcar.status()).toBe(200);

    expect((await leer(request, duenno, otra)).unread).toBe(0);
  });
});

test.describe('Chat — aislamiento', () => {
  test('sin proyecto en común no hay conversación privada', async ({ request }) => {
    /* Es **la** regla del privado: sin ella, cualquiera puede escribir a
       cualquiera de toda la plataforma con solo conocer su id. */
    const dentro = await nuevoInterlocutor(request);
    const fuera = await registrar(request);

    const intento = await request.post(conversacionDe(fuera, dentro, '/messages'), {
      headers: comoBearer(fuera.accessToken),
      data: { body: 'hola desconocido' },
    });

    expect(intento.status()).toBe(403);
  });

  test('🔴 compañeros de organización sin proyecto en común SÍ tienen conversación privada', async ({
    request,
  }) => {
    /* B6 de la auditoría (`docs/AUDITORIA-ORGANIZACION-CHAT-MOVIL.md`): la
       puerta del privado pasó de «compartís proyecto» a «compartís
       organización» (`DirectChatController.puedeHablarCon` →
       `QuotaService.compartenOrganizacion`), pero hasta ahora nada lo probaba
       con dos cuentas reales. La prueba de arriba no lo distingue: `dentro` y
       `fuera` tampoco comparten organización, así que pasaría igual con la
       regla vieja puesta. Esta mete a alguien en la organización personal del
       dueño **sin darlo de alta en el proyecto**, y comprueba que puede
       escribir igualmente. */
    const compañera = await registrar(request);

    const papeles = await data<{ id: string; isDefault: boolean }[]>(
      await request.get(`/api/organizations/${organizacionId}/roles`, {
        headers: comoBearer(duenno.accessToken),
      }),
    );
    const miembro = papeles.find((papel) => papel.isDefault)!;

    const invitacion = await data<{ enlace: string }>(
      await request.post(`/api/organizations/${organizacionId}/members`, {
        headers: comoBearer(duenno.accessToken),
        data: { email: compañera.email, roleId: miembro.id },
      }),
    );
    const token = new URL(invitacion.enlace).searchParams.get('token');
    expect(token, 'La invitación devuelve el enlace con el token dentro').toBeTruthy();

    const aceptada = await request.post('/api/me/organizations/invitations/accept', {
      headers: comoBearer(compañera.accessToken),
      data: { token },
    });
    expect(aceptada.status()).toBe(200);
    /* Ocupa asiento desde este momento: el `afterEach` la libera igual que a
       quien entra por un proyecto — la salida es la misma organización. */
    prestados.push(compañera);

    const mensaje = await request.post(conversacionDe(duenno, compañera, '/messages'), {
      headers: comoBearer(duenno.accessToken),
      data: { body: 'hola, equipo' },
    });
    expect(
      mensaje.status(),
      'La puerta del privado es la organización, no el proyecto compartido',
    ).toBe(201);
  });

  test('un mensaje ajeno no se toca desde otra conversación', async ({ request }) => {
    const unaPersona = await nuevoInterlocutor(request);
    const otraPersona = await nuevoInterlocutor(request);

    const ajeno = await escribir(request, duenno, otraPersona, 'mensaje de otro canal');

    /* El id existe y es del dueño, que es quien pide: lo único que lo separa es
       el canal de la ruta. Si el `channelId` no fuera al `where`, esto editaría
       un mensaje desde una conversación en la que no está. */
    const editar = await request.patch(
      conversacionDe(duenno, unaPersona, `/messages/${ajeno.id}`),
      { headers: comoBearer(duenno.accessToken), data: { body: 'cambiado desde fuera' } },
    );
    expect(editar.status()).toBe(404);

    const borrar = await request.delete(
      conversacionDe(duenno, unaPersona, `/messages/${ajeno.id}`),
      { headers: comoBearer(duenno.accessToken) },
    );
    expect(borrar.status()).toBe(404);

    const sigueIgual = await leer(request, duenno, otraPersona);
    const intacto = sigueIgual.items.find((m) => m.id === ajeno.id);
    expect(intacto?.body).toBe('mensaje de otro canal');
    expect(intacto?.deletedAt).toBeNull();
  });
});
