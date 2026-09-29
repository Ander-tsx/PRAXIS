import {
  CAPACIDADES,
  NOMBRE_DE_PERMISO,
  catalogoDeCapacidades,
  herramientasPara,
} from './capabilities';

/**
 * El catálogo de capacidades (D4 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Lo que se fija es lo que no daría error si se rompiera: que lo que se declara
 * y lo que se cuenta salgan de la misma lista, y que a quien le falta un permiso
 * se le diga cuál, con el nombre de la pantalla de roles.
 */
describe('capabilities', () => {
  const colaborador = {
    canViewProject: true,
    canViewReports: true,
    canComment: true,
    canMoveTask: true,
  };

  it('un colaborador recibe preguntar, mover, marcar pasos, comentar y los mensajes; nada más', () => {
    const nombres = herramientasPara(colaborador).map((h) => h.name);
    expect(nombres).toEqual([
      'proponer_pregunta',
      'proponer_movimiento',
      'proponer_marcar_pasos',
      'proponer_comentario',
      'proponer_mensaje',
      'proponer_mensaje_privado',
    ]);
  });

  /* El privado no depende de ningún permiso de proyecto: al chat privado se
     entra por la organización (trampa 22 de CLAUDE.md). */
  it('un rol de solo lectura puede preguntar y escribir por privado; nada más', () => {
    expect(herramientasPara({ canViewProject: true }).map((h) => h.name)).toEqual([
      'proponer_pregunta',
      'proponer_mensaje_privado',
    ]);
  });

  it('el tablero pide los dos permisos, no uno', () => {
    expect(herramientasPara({ canCreateBoard: true }).map((h) => h.name)).not.toContain(
      'proponer_tablero',
    );
    expect(
      herramientasPara({ canCreateBoard: true, canCreateColumn: true }).map((h) => h.name),
    ).toContain('proponer_tablero');
  });

  it('ninguna herramienta se declara dos veces', () => {
    const todos = Object.fromEntries(Object.keys(NOMBRE_DE_PERMISO).map((p) => [p, true]));
    const nombres = herramientasPara(todos).map((h) => h.name);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('el catálogo dice qué permiso falta, con el nombre de la pantalla de roles', () => {
    const catalogo = catalogoDeCapacidades(colaborador);
    expect(catalogo).toContain('Borrar tareas (no se deshace): LE FALTA «Eliminar tareas».');
    expect(catalogo).toContain('PUEDES PROPONERLO (proponer_comentario, proponer_mensaje)');
    expect(catalogo).toContain('LE FALTA «Crear tableros» y «Crear columnas»');
  });

  it('todo permiso que pide una capacidad tiene nombre legible', () => {
    for (const capacidad of CAPACIDADES) {
      for (const permiso of capacidad.permisos) {
        expect(NOMBRE_DE_PERMISO[permiso]).toBeTruthy();
      }
    }
  });
});
