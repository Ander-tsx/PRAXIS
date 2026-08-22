'use server';

import type {
  CrearOrganizacionState,
  InvitarMiembroState,
  OrganizacionState,
} from '@/lib/action-state';
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
  const tier = String(formData.get('tier') ?? '');
  const seats = Number(formData.get('seats') ?? 0);

  if (name.length < 2) return { error: 'Ponle un nombre de al menos dos letras.', creada: null };
  if (tier !== 'TEAM' && tier !== 'BUSINESS') {
    return { error: 'Ese plan no crea una organización.', creada: null };
  }
  if (!Number.isInteger(seats) || seats < 1) {
    return { error: 'Los asientos tienen que ser un número entero.', creada: null };
  }

  try {
    const creada = await createServerApiClient().post<OrganizationView>('/me/organizations', {
      name,
      tier,
      seats,
    });
    if (!creada?.id) return { error: 'El servidor no devolvió la organización.', creada: null };

    revalidatePath('/organizations');
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
 * Invita a alguien y devuelve el enlace.
 *
 * ⚠️ **El enlace se devuelve porque hoy no hay correo que lo lleve.** Mandarlo
 * exigiría abrirle al gateway una ruta de envío arbitrario en
 * credentials-service, que es el único que tiene `MailService`; mientras eso no
 * se decida, quien invita copia el enlace. Está anotado en el controlador.
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
  const role = String(formData.get('role') ?? 'MEMBER');

  if (!email.includes('@')) {
    return { error: 'Escribe una dirección de correo válida.', enlace: null, email: null };
  }

  try {
    const invitacion = await createServerApiClient().post<{ enlace: string; email: string }>(
      `/organizations/${organizationId}/members`,
      { email, ...(role === 'ADMIN' ? { role: 'ADMIN' } : {}) },
    );
    if (!invitacion?.enlace) {
      return { error: 'El servidor no devolvió el enlace.', enlace: null, email: null };
    }

    revalidatePath(`/organizations/${organizationId}`);
    return { error: null, enlace: invitacion.enlace, email: invitacion.email };
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
    revalidatePath(`/organizations/${organizationId}`);
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
  const role = String(formData.get('role') ?? '');

  if (role !== 'ADMIN' && role !== 'MEMBER') {
    /* ⚠️ `OWNER` no está, y no es un descuido: hay uno y es quien paga.
       Traspasar la suscripción tiene su propia conversación. */
    return { error: 'Ese papel no se puede conceder desde aquí.', done: null };
  }

  try {
    await createServerApiClient().patch(`/organizations/${organizationId}/members/${userId}`, {
      role,
    });
    revalidatePath(`/organizations/${organizationId}`);
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
    revalidatePath(`/organizations/${organizationId}`);
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

    revalidatePath('/organizations');
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
