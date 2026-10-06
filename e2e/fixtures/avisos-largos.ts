import { type Page, expect, request as pw } from '@playwright/test';
import { comoBearer, data, nombreUnico } from './api';
import { crearMundo } from './mundo';
import { crearCuentaYEntrar } from './ui';

const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000';

/** 100 caracteres: el máximo que admite el nombre de un proyecto. */
export const NOMBRE_LARGO =
  'Rediseño integral de la plataforma de gestión de inventarios y logística para la temporada navideña';

/**
 * Hace llegar a `page` el aviso de una invitación a un proyecto con el nombre
 * más largo posible, y devuelve la tarjeta de `sileo` ya desplegada.
 *
 * La invitación va por `userId` y no necesita asiento en la organización (al
 * revés que dar de alta), así que basta con dos cuentas sueltas.
 */
export async function recibirAvisoConNombreLargo(page: Page) {
  const api = await pw.newContext({ baseURL: GATEWAY });
  const mundo = await crearMundo(api);
  const delDuenno = comoBearer(mundo.duenno.accessToken);
  await api.patch(`/api/projects/${mundo.proyecto.id}`, {
    headers: delDuenno,
    data: { name: NOMBRE_LARGO },
  });

  await crearCuentaYEntrar(page);
  const yo = (await (await page.request.get('/api/gateway/users/me')).json()).data;
  await page.goto('/projects');
  /* Que el flujo en vivo esté abierto antes de provocar el aviso. */
  await page.waitForLoadState('networkidle');

  const rol = await api.post(`/api/projects/${mundo.proyecto.id}/roles`, {
    headers: delDuenno,
    data: { name: nombreUnico('Rol').slice(0, 50), permissions: { canViewProject: true } },
  });
  const projectRoleId = (await data<{ id: string }>(rol)).id;
  const invitacion = await api.post(`/api/projects/${mundo.proyecto.id}/invitations`, {
    headers: delDuenno,
    data: { userId: yo.userId ?? yo.id, projectRoleId },
  });
  expect(invitacion.status()).toBe(201);
  await api.dispose();

  const tarjeta = page.locator('[data-sileo-toast]').first();
  const texto = page.locator('[data-aviso-texto]').first();
  await expect(texto).toBeVisible({ timeout: 15_000 });
  return { tarjeta, texto };
}
