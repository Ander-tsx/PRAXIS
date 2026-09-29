import { expect, test } from '@playwright/test';
import { comoBearer, data, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea } from '../../fixtures/mundo';

/**
 * # Barrido de control de acceso
 *
 * Recorre **todas** las rutas de proyecto con dos identidades que no deberían
 * poder tocarlas, y comprueba que ninguna cede. Es la versión sistemática de lo
 * que encontró la fuga de los cinco endpoints anidados — aquello salió por
 * muestreo, y por muestreo se encuentra lo que se mira, no lo que hay.
 *
 * ## Las dos identidades
 *
 * - **Extraña** — tiene cuenta y nada más. Crear una cuesta una petición, así
 *   que es el atacante realista.
 * - **Lectora** — miembro del proyecto con `canViewProject` y nada más. Separa
 *   «no eres de aquí» de «eres de aquí pero esto no te toca», que son dos
 *   fallos distintos y se arreglan distinto.
 *
 * ## Por qué está escrito a mano y no generado
 *
 * Se intentó generarlo leyendo los controladores. El barrido generado **se
 * saboteó solo**: al recorrer las rutas por orden alfabético llamó a
 * `DELETE /projects/:id/membership/me` a mitad, la lectora se salió del
 * proyecto, y a partir de ahí todo respondió 403 — un falso positivo perfecto,
 * con pinta de fallo grave. Una lista explícita no tiene ese problema y además
 * se lee.
 *
 * ⚠️ **Al añadir una ruta de proyecto al gateway, añádela aquí.** Es el único
 * sitio donde se comprueba de forma exhaustiva, y una que falte no rompe nada:
 * simplemente deja de mirarse.
 */

/** Estados aceptables cuando alguien no debería poder. */
const DENIEGA = [401, 403, 404];

interface Recurso {
  proyectoId: string;
  workspaceId: string;
  boardId: string;
  columnaId: string;
  tareaId: string;
  rolId: string;
  etiquetaId: string;
  duennoId: string;
}

/** Toda ruta que cuelga de un proyecto, con un cuerpo válido si lo necesita. */
function rutasDeProyecto(r: Recurso) {
  return [
    // ── Lectura ────────────────────────────────────────────────────────────
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}` },
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}/members` },
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}/workspaces` },
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}/labels` },
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}/invitations` },
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}/permissions/me` },
    { m: 'GET', ruta: `/api/workspaces/${r.workspaceId}` },
    { m: 'GET', ruta: `/api/workspaces/${r.workspaceId}/boards` },
    { m: 'GET', ruta: `/api/boards/${r.boardId}` },
    { m: 'GET', ruta: `/api/boards/${r.boardId}/tasks` },
    { m: 'GET', ruta: `/api/tasks/${r.tareaId}` },
    { m: 'GET', ruta: `/api/tasks/${r.tareaId}/comments` },
    { m: 'GET', ruta: `/api/tasks/${r.tareaId}/attachments` },
    // ── Asistente (las rutas de informes se retiraron con Análisis) ─────────
    { m: 'GET', ruta: `/api/projects/${r.proyectoId}/assistant/quota` },
    // ── Escritura ──────────────────────────────────────────────────────────
    { m: 'PATCH', ruta: `/api/projects/${r.proyectoId}`, cuerpo: { name: 'Secuestrado' } },
    { m: 'DELETE', ruta: `/api/projects/${r.proyectoId}` },
    {
      m: 'POST',
      ruta: `/api/projects/${r.proyectoId}/workspaces`,
      cuerpo: { name: 'Intruso' },
    },
    { m: 'PATCH', ruta: `/api/workspaces/${r.workspaceId}`, cuerpo: { name: 'Secuestrado' } },
    { m: 'DELETE', ruta: `/api/workspaces/${r.workspaceId}` },
    { m: 'POST', ruta: `/api/workspaces/${r.workspaceId}/boards`, cuerpo: { name: 'Intruso' } },
    { m: 'PATCH', ruta: `/api/boards/${r.boardId}`, cuerpo: { name: 'Secuestrado' } },
    { m: 'DELETE', ruta: `/api/boards/${r.boardId}` },
    {
      m: 'POST',
      ruta: `/api/boards/${r.boardId}/columns`,
      cuerpo: { name: 'Intrusa', order: 9 },
    },
    {
      m: 'PATCH',
      ruta: `/api/boards/${r.boardId}/columns/${r.columnaId}`,
      cuerpo: { name: 'Secuestrada' },
    },
    { m: 'DELETE', ruta: `/api/boards/${r.boardId}/columns/${r.columnaId}` },
    {
      m: 'POST',
      ruta: `/api/boards/${r.boardId}/tasks`,
      cuerpo: { columnId: r.columnaId, title: 'Intrusa', status: 'Por hacer' },
    },
    { m: 'PATCH', ruta: `/api/tasks/${r.tareaId}`, cuerpo: { title: 'Secuestrada' } },
    { m: 'DELETE', ruta: `/api/tasks/${r.tareaId}` },
    {
      m: 'POST',
      ruta: `/api/tasks/${r.tareaId}/move`,
      cuerpo: { columnId: r.columnaId, status: 'Por hacer' },
    },
    { m: 'POST', ruta: `/api/tasks/${r.tareaId}/assign`, cuerpo: { assigneeIds: [] } },
    { m: 'POST', ruta: `/api/tasks/${r.tareaId}/comments`, cuerpo: { body: 'Intruso' } },
    { m: 'POST', ruta: `/api/tasks/${r.tareaId}/checklists`, cuerpo: { text: 'Intruso' } },
    {
      m: 'POST',
      ruta: `/api/projects/${r.proyectoId}/labels`,
      cuerpo: { name: 'x', color: 'info' },
    },
    {
      m: 'PATCH',
      ruta: `/api/projects/${r.proyectoId}/labels/${r.etiquetaId}`,
      cuerpo: { name: 'secuestrada' },
    },
    { m: 'DELETE', ruta: `/api/projects/${r.proyectoId}/labels/${r.etiquetaId}` },
    {
      m: 'POST',
      ruta: `/api/projects/${r.proyectoId}/roles`,
      cuerpo: { name: 'Intruso', permissions: { canViewProject: true } },
    },
    {
      m: 'PATCH',
      ruta: `/api/projects/${r.proyectoId}/roles/${r.rolId}`,
      cuerpo: { name: 'Secuestrado' },
    },
    { m: 'DELETE', ruta: `/api/projects/${r.proyectoId}/roles/${r.rolId}` },
    {
      m: 'DELETE',
      ruta: `/api/projects/${r.proyectoId}/members`,
      cuerpo: { userId: r.duennoId },
    },
  ] as const;
}

/**
 * Lo que una miembro con **solo** `canViewProject` debe poder leer.
 *
 * ⚠️ **El asistente no entra, y no es un descuido.** `/assistant/*` exige
 * `canViewReports`, que es un permiso aparte: PRAX lee los números del
 * proyecto —quién cierra cuánto, quién va lento—, y eso no es lo mismo que ver
 * el tablero. Lo mismo con `/invitations`, que pide `canManageMembers`.
 *
 * El barrido lo destapó por su cuenta con las siete rutas de `/reports/*`, que
 * se retiraron con la página de Análisis: al no distinguirlas daba siete
 * «lecturas negadas» que parecían un fallo y eran la regla funcionando.
 */
const SON_LECTURA = (ruta: string, metodo: string) =>
  metodo === 'GET' && !ruta.includes('/invitations') && !ruta.includes('/assistant/');

async function montarRecurso(request: Parameters<typeof crearMundo>[0]): Promise<{
  recurso: Recurso;
  tokenDuenno: string;
}> {
  const mundo = await crearMundo(request);
  const cabeceras = comoBearer(mundo.duenno.accessToken);
  const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

  const rol = await data<{ id: string }>(
    await request.post(`/api/projects/${mundo.proyecto.id}/roles`, {
      headers: cabeceras,
      data: { name: nombreUnico('Rol').slice(0, 50), permissions: { canViewProject: true } },
    }),
  );

  const etiqueta = await data<{ id: string }>(
    await request.post(`/api/projects/${mundo.proyecto.id}/labels`, {
      headers: cabeceras,
      data: { name: 'barrido', color: 'info' },
    }),
  );

  return {
    tokenDuenno: mundo.duenno.accessToken,
    recurso: {
      proyectoId: mundo.proyecto.id,
      workspaceId: mundo.workspaceId,
      boardId: mundo.boardId,
      columnaId: mundo.primeraColumna.id,
      tareaId: tarea.id,
      rolId: rol.id,
      etiquetaId: etiqueta.id,
      duennoId: mundo.duenno.userId,
    },
  };
}

/** El barrido monta bastantes recursos; va holgado. */
test.describe.configure({ timeout: 180_000 });

test.describe('Barrido de control de acceso', () => {
  test('ninguna ruta de proyecto cede ante una cuenta extraña', async ({ request }) => {
    const { recurso } = await montarRecurso(request);
    const extrana = await registrar(request);
    const cabeceras = comoBearer(extrana.accessToken);

    const cedieron: string[] = [];

    for (const { m, ruta, cuerpo } of rutasDeProyecto(recurso)) {
      const respuesta = await request.fetch(ruta, {
        method: m,
        headers: cabeceras,
        ...(cuerpo ? { data: cuerpo } : {}),
      });
      if (!DENIEGA.includes(respuesta.status())) {
        cedieron.push(`${m} ${ruta.replace(/[0-9a-f-]{36}/g, ':id')} → ${respuesta.status()}`);
      }
    }

    expect(cedieron, `Rutas que responden a un extraño:\n  ${cedieron.join('\n  ')}`).toEqual([]);
  });

  /**
   * Cuarto criterio: **que el DTO valide de verdad**.
   *
   * `forbidNonWhitelisted` está puesto globalmente, pero eso solo actúa si el
   * `@Body()` está tipado con un DTO real. Un `@Body()` tipado con
   * `Omit<XDto, 'algo'>` es `Object` en runtime: acepta cualquier cosa y guarda
   * nada, devolviendo **200 sin haber hecho el trabajo**. Le pasó a 22 de los 28
   * endpoints de entonces, y se arregló uno a uno.
   *
   * La forma de comprobarlo desde fuera es mandar un campo que ningún DTO
   * declara: si el pipe está activo son 400; si el `@Body()` es `Object`, pasa.
   *
   * Se hace con el **dueño** a propósito: con un extraño el guard rechazaría
   * antes de llegar a la validación y esto no probaría nada.
   */
  test('ninguna escritura acepta un campo que no declara su DTO', async ({ request }) => {
    const { recurso, tokenDuenno } = await montarRecurso(request);
    const cabeceras = comoBearer(tokenDuenno);

    const aceptaronBasura: string[] = [];

    for (const { m, ruta, cuerpo } of rutasDeProyecto(recurso)) {
      /* Solo las que llevan cuerpo: en un GET o un DELETE sin body no hay DTO
         que probar. Y se saltan las destructivas, que dejarían sin recurso a
         las siguientes. */
      if (!cuerpo) continue;
      if (m === 'DELETE') continue;

      const respuesta = await request.fetch(ruta, {
        method: m,
        headers: cabeceras,
        data: { ...cuerpo, campoQueNingunDtoDeclara: 'basura' },
      });

      if (respuesta.status() !== 400) {
        aceptaronBasura.push(
          `${m} ${ruta.replace(/[0-9a-f-]{36}/g, ':id')} → ${respuesta.status()}`,
        );
      }
    }

    expect(
      aceptaronBasura,
      `Escrituras que tragaron un campo desconocido (¿@Body() sin DTO real?):\n  ${aceptaronBasura.join('\n  ')}`,
    ).toEqual([]);
  });

  test('una miembro de solo lectura lee, y no escribe nada', async ({ request }) => {
    const { recurso, tokenDuenno } = await montarRecurso(request);
    const lectora = await registrar(request);
    const delDuenno = comoBearer(tokenDuenno);

    const rol = await data<{ id: string }>(
      await request.post(`/api/projects/${recurso.proyectoId}/roles`, {
        headers: delDuenno,
        data: { name: nombreUnico('Lect').slice(0, 50), permissions: { canViewProject: true } },
      }),
    );
    await request.post(`/api/projects/${recurso.proyectoId}/members`, {
      headers: delDuenno,
      data: { userId: lectora.userId, projectRoleId: rol.id },
    });

    const cabeceras = comoBearer(lectora.accessToken);
    const escrituraQueCedio: string[] = [];
    const lecturaDenegada: string[] = [];

    for (const { m, ruta, cuerpo } of rutasDeProyecto(recurso)) {
      const respuesta = await request.fetch(ruta, {
        method: m,
        headers: cabeceras,
        ...(cuerpo ? { data: cuerpo } : {}),
      });
      const etiqueta = `${m} ${ruta.replace(/[0-9a-f-]{36}/g, ':id')} → ${respuesta.status()}`;

      if (SON_LECTURA(ruta, m)) {
        /* `canViewProject` es el suelo de la jerarquía: si no basta para leer,
           el rol de solo lectura no sirve para nada. */
        if (respuesta.status() !== 200) lecturaDenegada.push(etiqueta);
      } else if (!DENIEGA.includes(respuesta.status())) {
        escrituraQueCedio.push(etiqueta);
      }
    }

    expect(
      lecturaDenegada,
      `Lecturas negadas a quien tiene canViewProject:\n  ${lecturaDenegada.join('\n  ')}`,
    ).toEqual([]);
    expect(
      escrituraQueCedio,
      `Escrituras que aceptó una cuenta de solo lectura:\n  ${escrituraQueCedio.join('\n  ')}`,
    ).toEqual([]);
  });
});
