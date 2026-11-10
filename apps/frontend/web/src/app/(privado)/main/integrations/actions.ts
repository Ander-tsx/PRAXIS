'use server';

import type { CrearTokenState, NotificationState } from '@/lib/main/action-state';
import type { McpConnectionView, PersonalTokenView } from '@/lib/main/integrations';
import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import type { OrganizationView } from '@praxis/commons/billing/planes';
import { revalidatePath } from 'next/cache';

/**
 * Las escrituras de Integraciones (docs/PLAN-MCP.md, M5 y M14).
 *
 * Se valida aquí lo que se puede validar sin salir —el nombre, los permisos—
 * porque el mensaje llega antes. Lo que decide es el gateway: el plan, la
 * pertenencia y el interruptor de la organización. Y **se confirma contra el
 * `data` de la respuesta**, no contra el estado.
 */

const SESION_CADUCADA = 'Tu sesión ha caducado. Vuelve a entrar.';
const PERMISOS = ['read', 'write', 'delete'];

export async function crearTokenAction(
  _prev: CrearTokenState,
  formData: FormData,
): Promise<CrearTokenState> {
  if (!(await getSession())) return { error: SESION_CADUCADA, token: null };

  const name = String(formData.get('name') ?? '').trim();
  const organizationId = String(formData.get('organizationId') ?? '');
  /* Leer va siempre: sin él el agente no puede ni orientarse. */
  const scopes = [
    'read',
    ...formData
      .getAll('scopes')
      .map(String)
      .filter((s) => s !== 'read' && PERMISOS.includes(s)),
  ];
  const expiresInDays = Number(formData.get('expiresInDays') ?? 90);

  if (name.length === 0) return { error: 'Ponle un nombre para reconocerlo.', token: null };
  if (name.length > 60) return { error: 'El nombre admite hasta 60 caracteres.', token: null };
  if (!Number.isInteger(expiresInDays) || expiresInDays < 0 || expiresInDays > 365) {
    return { error: 'Elige una caducidad de la lista.', token: null };
  }

  try {
    const creado = await createServerApiClient().post<{ token: string }>('/me/tokens', {
      name,
      organizationId,
      scopes,
      expiresInDays,
    });
    if (!creado?.token) return { error: 'El servidor no devolvió el token.', token: null };
    revalidatePath('/main/integrations');
    return { error: null, token: creado.token };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo crear el token.',
      token: null,
    };
  }
}

export async function revocarTokenAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  if (!(await getSession())) return { error: SESION_CADUCADA, done: null };

  const id = String(formData.get('id') ?? '');
  try {
    const revocado = await createServerApiClient().delete<PersonalTokenView>(`/me/tokens/${id}`);
    if (!revocado?.revokedAt)
      return { error: 'El servidor no confirmó la revocación.', done: null };
    revalidatePath('/main/integrations');
    return { error: null, done: id };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo revocar el token.',
      done: null,
    };
  }
}

export async function permitirMcpAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  if (!(await getSession())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const mcpAllowed = formData.get('mcpAllowed') === 'true';
  try {
    const organizacion = await createServerApiClient().patch<OrganizationView>(
      `/organizations/${organizationId}/integrations`,
      { mcpAllowed },
    );
    if (organizacion?.mcpAllowed !== mcpAllowed) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
    revalidatePath('/main/integrations');
    return { error: null, done: String(mcpAllowed) };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo cambiar el permiso.',
      done: null,
    };
  }
}

/* ─── Clientes de IA conectados por OAuth (docs/PLAN-OAUTH-KYLOO.md) ──────── */

export async function actualizarConexionAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  if (!(await getSession())) return { error: SESION_CADUCADA, done: null };

  const id = String(formData.get('id') ?? '');
  const allowedOrgIds = formData.getAll('allowedOrgIds').map(String);
  const activeOrgId = String(formData.get('activeOrgId') ?? '');

  if (allowedOrgIds.length === 0) return { error: 'Deja al menos una organización.', done: null };
  if (!allowedOrgIds.includes(activeOrgId)) {
    return { error: 'La organización activa tiene que estar entre las marcadas.', done: null };
  }

  try {
    const guardada = await createServerApiClient().patch<McpConnectionView>(
      `/me/mcp/connections/${id}`,
      { allowedOrgIds, activeOrgId },
    );
    if (guardada?.activeOrgId !== activeOrgId) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
    revalidatePath('/main/integrations');
    return { error: null, done: id };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo guardar la conexión.',
      done: null,
    };
  }
}

export async function revocarConexionAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  if (!(await getSession())) return { error: SESION_CADUCADA, done: null };

  const id = String(formData.get('id') ?? '');
  try {
    const revocada = await createServerApiClient().delete<McpConnectionView>(
      `/me/mcp/connections/${id}`,
    );
    if (!revocada?.revokedAt)
      return { error: 'El servidor no confirmó la revocación.', done: null };
    revalidatePath('/main/integrations');
    return { error: null, done: id };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo revocar la conexión.',
      done: null,
    };
  }
}

/**
 * Enciende o apaga la coautoría de los agentes de IA en la organización activa: con ella,
 * lo que se hace por MCP se marca en la tarea, el checklist y las notas.
 */
export async function permitirAtribucionAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  if (!(await getSession())) return { error: SESION_CADUCADA, done: null };

  const organizationId = String(formData.get('organizationId') ?? '');
  const agentAttribution = formData.get('agentAttribution') === 'true';
  try {
    const organizacion = await createServerApiClient().patch<OrganizationView>(
      `/organizations/${organizationId}/agent-attribution`,
      { agentAttribution },
    );
    if (organizacion?.agentAttribution !== agentAttribution) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
    revalidatePath('/main/integrations');
    return { error: null, done: String(agentAttribution) };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'No se pudo cambiar el ajuste.',
      done: null,
    };
  }
}
