'use server';

import type {
  CrearOrganizacionState,
  InvitarMiembroState,
  OrganizacionState,
} from '@/lib/main/action-state';
import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import type { OrganizationView } from '@praxis/commons/billing/planes';
import { revalidatePath } from 'next/cache';

/**
 * Las escrituras del portal de una organización.
 *
 * ## Qué comprueba esto y qué no
 *
 * Aquí se valida lo que se puede validar sin salir del navegador —que el nombre
 * tenga dos letras, que los asientos sean un número— porque **el mensaje llega
 * antes y señala el campo**. Lo que decide de verdad es el servidor: el papel
 * dentro de la organización solo lo sabe billing-service, y un `ADMIN` que
 * intente cambiar los asientos recibe un 403 por mucho que la pantalla le haya
 * enseñado el formulario.
 *
 * ⚠️ **Y se confirma contra el `data` de la respuesta, no contra el status.**
 * Es la costumbre de la casa y nació de un 200 que no guardaba nada.
 */

/** El cliente del gateway, o el estado de sesión caducada de cada acción. */
async function sesionViva(): Promise<boolean> {
  return (await getSession()) !== null;
}

const SESION_CADUCADA = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

export async function crearOrganizacionAction(
  _prev: CrearOrganizacionState,
  formData: FormData,
): Promise<CrearOrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, creada: null };

  const name = String(formData.get('name') ?? '').trim();

  if (name.length < 2) return { error: 'Ponle un nombre de al menos dos letras.', creada: null };

  /* 🔴 **Nace en gratuito y sin preguntar el plan, y es de 2026-08-26.**
     Antes el formulario exigía elegir TEAM o BUSINESS y cuántos asientos
     comprar **antes** de que existiera la organización: una decisión comercial
     pedida a alguien que todavía no sabe qué es esto. Ahora se crea con nombre
     y ya; el plan se contrata desde su portal, cuando el equipo o los proyectos
     no quepan y ampliar signifique algo.

     Los tres asientos son los del plan gratuito, y salen del catálogo del
     servidor por la vía de siempre: escribir el número aquí sería prometer uno
     que el guard puede negar. */
  try {
    const creada = await createServerApiClient().post<OrganizationView>('/me/organizations', {
      name,
    });
    if (!creada?.id) return { error: 'El servidor no devolvió la organización.', creada: null };

    revalidatePath('/main/team');
    return { error: null, creada: creada.id };
  } catch (error) {
    /* El mensaje del backend cuando lo hay: «El plan Equipo empieza en 3
       asientos» se arregla leyéndolo, y «no se pudo» no. */
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo crear la organización.',
      creada: null,
    };
  }
}

/**
 * Invita a alguien: manda el correo **y** devuelve el enlace.
 *
 * ⚠️ **Las dos cosas, y no una.** Desde 2026-08-27 sale un correo con la
 * invitación, pero el enlace se sigue devolviendo: un correo se pierde en no
 * deseados el día que hay que enseñarlo, y el token en claro **solo existe en
 * esa respuesta** —en la base queda su hash—. Que se pueda copiar además de
 * enviarse no cuesta nada y salva el caso.
 */
export async function invitarMiembroAction(
  _prev: InvitarMiembroState,
  formData: FormData,
): Promise<InvitarMiembroState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, enlace: null, email: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const roleId = String(formData.get('roleId') ?? '');

  if (!email.includes('@')) {
    return { error: 'Escribe una dirección de correo válida.', enlace: null, email: null };
  }

  try {
    const invitacion = await createServerApiClient().post<{
      enlace: string;
      email: string;
      correoEnviado: boolean;
    }>(
      `/organizations/${organizationId}/members`,
      /* Sin `roleId` entra con el papel que la organización tenga por defecto,
         que al crearse es «Miembro». Mandar la clave vacía daría 400: el DTO no
         declara cadenas vacías y el gateway ya valida los 28 endpoints. */
      { email, ...(roleId ? { roleId } : {}) },
    );
    if (!invitacion?.enlace) {
      return { error: 'El servidor no devolvió el enlace.', enlace: null, email: null };
    }

    revalidatePath('/main/team');
    return {
      error: null,
      enlace: invitacion.enlace,
      email: invitacion.email,
      correoEnviado: invitacion.correoEnviado,
    };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo enviar la invitación.',
      enlace: null,
      email: null,
    };
  }
}

export async function quitarMiembroAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  /* El `userId` de quien ya entró, o el correo de quien todavía no: una
     invitación sin aceptar no tiene identificador todavía. */
  const idOrEmail = String(formData.get('idOrEmail') ?? '');
  if (!idOrEmail) return { error: 'No se sabe a quién sacar.', done: null };

  try {
    await createServerApiClient().delete(
      `/organizations/${organizationId}/members/${encodeURIComponent(idOrEmail)}`,
    );
    revalidatePath('/main/team');
    return { error: null, done: idOrEmail };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo sacar a esa persona.',
      done: null,
    };
  }
}

export async function cambiarRolAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  if (!roleId) {
    return { error: 'Hay que decir qué papel se le pone.', done: null };
  }

  /* ⚠️ Ser dueño no es un papel, así que no se puede conceder por aquí: hay uno
     y es quien paga. Traspasar la organización tiene su propia ruta y su propia
     confirmación. Y el servidor rechaza además un papel con permisos que quien
     lo reparte no tiene — repartir permisos no puede crear permisos. */
  try {
    await createServerApiClient().patch(`/organizations/${organizationId}/members/${userId}`, {
      roleId,
    });
    revalidatePath('/main/team');
    return { error: null, done: userId };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo cambiar el papel.',
      done: null,
    };
  }
}

export async function cambiarAsientosAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const seats = Number(formData.get('seats') ?? 0);

  if (!Number.isInteger(seats) || seats < 1) {
    return { error: 'Los asientos tienen que ser un número entero.', done: null };
  }

  try {
    await createServerApiClient().patch(`/organizations/${organizationId}/seats`, { seats });
    revalidatePath('/main/team');
    return { error: null, done: String(seats) };
  } catch (error) {
    /* El 409 llega con el número de ocupados dentro: «Hay 5 asientos ocupados…».
       Es justo lo que hace falta para saber a cuánto sí se puede bajar. */
    return {
      error: error instanceof ApiError ? error.message : 'No se pudieron cambiar los asientos.',
      done: null,
    };
  }
}

/**
 * Nombre, icono y color de la organización, en un solo `PATCH /organizations/:id`.
 *
 * Antes vivía en un modal del selector de la barra lateral (`OrgSettingsModal`
 * en `commons/OrgSwitcher`), que hacía el `fetch` a mano. Se movió al portal de
 * la organización: el botón «Configuración» del desplegable ahora **navega**
 * aquí en vez de abrir el modal, así toda la configuración de la organización
 * está en un sitio.
 *
 * ⚠️ **`iconKey` vacío es `null`**: así se vuelve al monograma de letras. Y el
 * `color` solo viaja si hay icono — guardar un acento que nada pinta es ruido.
 * El backend exige `canManageOrganization`; quien no lo tenga recibe el 403 con
 * su texto.
 */
export async function guardarIdentidadOrgAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const iconKey = String(formData.get('iconKey') ?? '') || null;
  const color = String(formData.get('color') ?? '') || null;

  if (name.length < 2) {
    return { error: 'El nombre necesita al menos 2 caracteres.', done: null };
  }

  try {
    await createServerApiClient().patch(`/organizations/${organizationId}`, {
      name,
      iconKey,
      color: iconKey ? color : null,
    });
    revalidatePath('/main/team');
    return { error: null, done: name };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo guardar la configuración.',
      done: null,
    };
  }
}

export async function aceptarInvitacionAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const token = String(formData.get('token') ?? '').trim();
  if (token.length < 20) return { error: 'Ese enlace no parece completo.', done: null };

  try {
    const organizacion = await createServerApiClient().post<OrganizationView>(
      '/me/organizations/invitations/accept',
      { token },
    );
    if (!organizacion?.id) return { error: 'El servidor no confirmó la entrada.', done: null };

    revalidatePath('/main/team');
    return { error: null, done: organizacion.id };
  } catch (error) {
    /* 410: caducada, ya usada, o dirigida a otra dirección. Los tres se dicen
       igual de claro desde el backend y no hay nada que añadir aquí. */
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo aceptar la invitación.',
      done: null,
    };
  }
}

/* ─── Papeles de la organización ───────────────────────────────────────────
 *
 * 🔴 **Repartir permisos no puede crear permisos.** El servidor rechaza un papel
 * con permisos que quien lo guarda no tiene, y su mensaje es el que se enseña:
 * traducirlo aquí sería adivinar cuál de los nueve sobra.
 */

/** Los permisos llegan como casillas del formulario, no como un objeto. */
function permisosDelFormulario(formData: FormData): Record<string, boolean> {
  const permisos: Record<string, boolean> = {};
  for (const [clave, valor] of formData.entries()) {
    if (clave.startsWith('permiso.')) permisos[clave.slice('permiso.'.length)] = valor === 'true';
  }
  return permisos;
}

export async function guardarPapelAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  if (name.length < 2) return { error: 'Ponle un nombre de al menos dos letras.', done: null };

  const cuerpo = { name, permissions: permisosDelFormulario(formData) };

  try {
    const api = createServerApiClient();
    const guardado = roleId
      ? await api.patch<{ id: string }>(`/organizations/${organizationId}/roles/${roleId}`, cuerpo)
      : await api.post<{ id: string }>(`/organizations/${organizationId}/roles`, cuerpo);

    if (!guardado?.id) return { error: 'El servidor no devolvió el papel.', done: null };

    revalidatePath('/main/team');
    return { error: null, done: guardado.id };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo guardar el papel.',
      done: null,
    };
  }
}

export async function borrarPapelAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  try {
    await createServerApiClient().delete(`/organizations/${organizationId}/roles/${roleId}`);
    revalidatePath('/main/team');
    return { error: null, done: roleId };
  } catch (error) {
    /* El mensaje del servidor dice **cuánta gente** hay que mover antes de poder
       borrarlo, que es lo único que hace que se pueda arreglar. */
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo borrar el papel.',
      done: null,
    };
  }
}

/* ─── Plantillas de rol de proyecto ────────────────────────────────────────
 *
 * ⚠️ Solo afectan a los proyectos **nuevos**. Reescribir los roles de los que ya
 * existen sería borrar el trabajo de quien los ajustó, desde una pantalla que
 * habla de otra cosa. La pantalla lo dice.
 */

export async function guardarPlantillaAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const templateId = String(formData.get('templateId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  if (name.length < 2) return { error: 'Ponle un nombre de al menos dos letras.', done: null };

  const cuerpo = { name, permissions: permisosDelFormulario(formData) };

  try {
    const api = createServerApiClient();
    const guardada = templateId
      ? await api.patch<{ id: string }>(
          `/organizations/${organizationId}/role-templates/${templateId}`,
          cuerpo,
        )
      : await api.post<{ id: string }>(`/organizations/${organizationId}/role-templates`, cuerpo);

    if (!guardada?.id) return { error: 'El servidor no devolvió la plantilla.', done: null };

    revalidatePath('/main/team');
    return { error: null, done: guardada.id };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo guardar la plantilla.',
      done: null,
    };
  }
}

export async function borrarPlantillaAction(
  _prev: OrganizacionState,
  formData: FormData,
): Promise<OrganizacionState> {
  if (!(await sesionViva())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const templateId = String(formData.get('templateId') ?? '');

  try {
    await createServerApiClient().delete(
      `/organizations/${organizationId}/role-templates/${templateId}`,
    );
    revalidatePath('/main/team');
    return { error: null, done: templateId };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo borrar la plantilla.',
      done: null,
    };
  }
}
