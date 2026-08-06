/// <reference types="jest" />

import { RpcException } from '@nestjs/microservices';
import { PROJECT_SUSPENDED_CODE, ProjectPermission } from '@praxis/contracts';
import { recortarPorEstado } from '../project-roles/project-roles.service';
import { exigirProyectoActivo } from './project-status.guard';

/**
 * Las reglas del estado de un proyecto, en prueba.
 *
 * No es una prueba de cobertura. Cada bloque es una decisión con una consecuencia
 * concreta escrita al lado, y todas comparten la misma: **si el recorte falla, la
 * suspensión no suspende nada** — el guard sigue devolviendo 403, pero la interfaz
 * enseña botones que fallan uno a uno, que es el fallo que esta pieza existe para
 * evitar.
 *
 * `exigirProyectoActivo` recibe un lector mínimo en vez del `PrismaService`, que es
 * justo para lo que se declaró así: la regla se prueba sin base de datos.
 */
describe('estado administrativo de un proyecto', () => {
  describe('recortarPorEstado', () => {
    /** Un mapa con todo concedido, como el que recibe el dueño. */
    const todoConcedido = (): Record<string, boolean> =>
      Object.fromEntries(Object.values(ProjectPermission).map((p) => [p, true]));

    it('un proyecto activo no se toca', () => {
      const mapa = todoConcedido();
      expect(recortarPorEstado(mapa, 'ACTIVE')).toEqual(mapa);
    });

    it('suspendido deja solo lectura, y también al dueño', () => {
      /* El dueño es la persona a la que se le suspendió el proyecto. Si el bypass de
         dueño sobreviviera al recorte, la suspensión solo afectaría a los demás
         miembros y no serviría para nada. */
      const recortado = recortarPorEstado(todoConcedido(), 'SUSPENDED');

      expect(recortado[ProjectPermission.CAN_VIEW_PROJECT]).toBe(true);
      expect(recortado[ProjectPermission.CAN_VIEW_REPORTS]).toBe(true);

      const escrituras = Object.values(ProjectPermission).filter(
        (p) => p !== ProjectPermission.CAN_VIEW_PROJECT && p !== ProjectPermission.CAN_VIEW_REPORTS,
      );
      for (const permiso of escrituras) {
        expect(recortado[permiso]).toBe(false);
      }
    });

    it('comentar cuenta como escritura', () => {
      /* Es el caso que más se discute —leer y opinar no es editar el trabajo de
         nadie— y aun así escribe una fila. Un proyecto suspendido no cambia. */
      expect(recortarPorEstado(todoConcedido(), 'SUSPENDED')[ProjectPermission.CAN_COMMENT]).toBe(
        false,
      );
    });

    it('no concede lo que no estaba concedido', () => {
      /* El recorte solo quita. Si diera `canViewReports` a quien no lo tenía, una
         suspensión sería una promoción a los informes del proyecto. */
      const soloVer = { ...todoConcedido(), [ProjectPermission.CAN_VIEW_REPORTS]: false };

      expect(recortarPorEstado(soloVer, 'SUSPENDED')[ProjectPermission.CAN_VIEW_REPORTS]).toBe(
        false,
      );
    });

    it('archivado no concede nada, ni leer', () => {
      /* Hoy es inalcanzable —el guard responde 404 antes—, y se recorta igual: una
         ruta futura que pregunte los permisos sin ese guard no debe recibir el mapa
         entero de un proyecto que se supone que no existe. */
      const recortado = recortarPorEstado(todoConcedido(), 'DELETED');

      expect(Object.values(recortado).some(Boolean)).toBe(false);
    });

    it('un estado desconocido no concede nada', () => {
      /* Falla cerrado. Si mañana se añade un estado al enum y nadie toca esto, el
         resultado es una pantalla sin botones —molesto y visible— en vez de un
         proyecto que se puede editar cuando no debería. */
      expect(Object.values(recortarPorEstado(todoConcedido(), 'ARCHIVED_V2')).some(Boolean)).toBe(
        false,
      );
    });
  });

  describe('exigirProyectoActivo', () => {
    /** El lector mínimo que declara el propio guard, con el estado que se le pida. */
    const lectorCon = (project: { status: string; suspendedReason: string | null } | null) =>
      ({
        project: { findUnique: async () => project },
      }) as Parameters<typeof exigirProyectoActivo>[0];

    it('un proyecto activo pasa', async () => {
      await expect(
        exigirProyectoActivo(lectorCon({ status: 'ACTIVE', suspendedReason: null }), 'id'),
      ).resolves.toBeUndefined();
    });

    it('suspendido da 403 con el código que la interfaz necesita', async () => {
      /* El código es lo que distingue «está suspendido» de «no tienes permiso». Los
         dos son 403 y no se arreglan igual: sin el código, el dueño de un proyecto
         suspendido acaba pidiéndose permisos a sí mismo. */
      const error = await exigirProyectoActivo(
        lectorCon({ status: 'SUSPENDED', suspendedReason: 'Uso indebido' }),
        'id',
      ).catch((e: unknown) => e as RpcException);

      expect(error).toBeInstanceOf(RpcException);
      expect(error.getError()).toMatchObject({
        statusCode: 403,
        code: PROJECT_SUSPENDED_CODE,
      });
    });

    it('el motivo viaja en el mensaje', async () => {
      /* Es lo que evita que parezca un fallo: estas tres rutas no pasan por el guard
         del gateway, así que este mensaje es todo lo que va a ver quien las llame. */
      const error = await exigirProyectoActivo(
        lectorCon({ status: 'SUSPENDED', suspendedReason: 'Uso indebido' }),
        'id',
      ).catch((e: unknown) => e as RpcException);

      expect((error.getError() as { message: string }).message).toContain('Uso indebido');
    });

    it('archivado da 404, no 403', async () => {
      /* Un 403 diría «existe y no es tuyo», que es falso y además filtra que ese
         proyecto existe. Un 404 dice lo que hay: por esta puerta no hay nada. */
      const error = await exigirProyectoActivo(
        lectorCon({ status: 'DELETED', suspendedReason: 'Duplicado' }),
        'id',
      ).catch((e: unknown) => e as RpcException);

      expect(error.getError()).toMatchObject({ statusCode: 404 });
    });

    it('un proyecto que no existe da 404', async () => {
      const error = await exigirProyectoActivo(lectorCon(null), 'id').catch(
        (e: unknown) => e as RpcException,
      );

      expect(error.getError()).toMatchObject({ statusCode: 404 });
    });
  });
});
