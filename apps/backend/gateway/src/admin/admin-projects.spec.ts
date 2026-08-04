/// <reference types="jest" />

import { AdminActionType, ProjectStatus } from '@praxis/contracts';
import { accionDelCambio } from './admin-projects.controller';

/**
 * Qué se anota en el registro al cambiar el estado de un proyecto.
 *
 * Parece cosmético y no lo es: **el registro es solo-añadir y no tiene ruta de
 * edición**, ni para un SuperAdmin. Una entrada mal tipada se queda mal para
 * siempre, y el error es invisible —la operación funciona, la fila aparece, dice otra
 * cosa— así que no hay ningún momento en que alguien lo note por su cuenta.
 */
describe('accionDelCambio', () => {
  it('suspender y archivar se distinguen', () => {
    expect(accionDelCambio(ProjectStatus.SUSPENDED)).toBe(AdminActionType.PROJECT_SUSPENDED);
    expect(accionDelCambio(ProjectStatus.DELETED)).toBe(AdminActionType.PROJECT_ARCHIVED);
  });

  it('volver a activo depende de dónde se venga, no del destino', () => {
    /* Los dos terminan en ACTIVE y son dos cosas distintas para quien lee la
       auditoría: reactivar levanta un bloqueo que todos veían, recuperar devuelve a
       la vista un proyecto que había desaparecido. */
    expect(accionDelCambio(ProjectStatus.ACTIVE, ProjectStatus.SUSPENDED)).toBe(
      AdminActionType.PROJECT_REACTIVATED,
    );
    expect(accionDelCambio(ProjectStatus.ACTIVE, ProjectStatus.DELETED)).toBe(
      AdminActionType.PROJECT_RESTORED,
    );
  });

  it('sin estado anterior no se inventa una recuperación', () => {
    /* `previousStatus` lo devuelve el microservicio; si un día dejara de llegar, el
       registro debe decir lo genérico y cierto —se reactivó— en vez de afirmar que
       se recuperó un archivado que quizá no lo estaba. */
    expect(accionDelCambio(ProjectStatus.ACTIVE)).toBe(AdminActionType.PROJECT_REACTIVATED);
  });

  it('el estado anterior no manda cuando se suspende', () => {
    /* Suspender un archivado sigue siendo suspender. Si el anterior pesara más que el
       destino, archivar y volver a suspender anotaría una recuperación. */
    expect(accionDelCambio(ProjectStatus.SUSPENDED, ProjectStatus.DELETED)).toBe(
      AdminActionType.PROJECT_SUSPENDED,
    );
  });
});
