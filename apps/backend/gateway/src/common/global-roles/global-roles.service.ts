import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  type GlobalRole,
  canGrantGlobalRole,
  outranks,
  satisfiesGlobalRole,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

/**
 * Los roles globales de un usuario, resueltos una sola vez y en un solo sitio.
 *
 * ## Por qué es un servicio y no la llamada suelta que había
 *
 * `GlobalRoleGuard` y `AccountOwnerGuard` hacían cada uno su propio
 * `permission_check_role` con su propia constante `'Admin'` y su propio
 * `catch { return false }`. Dos copias de una decisión de seguridad son dos sitios
 * donde arreglar el siguiente fallo, y la forma habitual de que uno de ellos
 * acabe fallando **abierto** por descuido. Con la jerarquía y las reglas de
 * "actuar solo hacia abajo" son tres los consumidores —los dos guards y el
 * namespace `/admin`— así que la copia se paga tres veces.
 *
 * ## `permission_get_user_roles`, no `permission_check_role`
 *
 * El comando de comprobación devuelve un booleano para **un nombre exacto**, y
 * con jerarquía eso ya no sirve: preguntar "¿tiene Admin?" a un `SuperAdmin`
 * responde que no. Aquí se piden los roles y la jerarquía se aplica en memoria
 * con los helpers de `@praxis/contracts`, que es donde vive el orden.
 *
 * No cuesta una petición más: `getUserRoles` está cacheado 60 s en
 * permissions-service, igual que lo estaba `checkRole`, y una sola respuesta
 * sirve para todas las preguntas de la misma petición.
 */
@Injectable()
export class GlobalRolesService {
  private readonly logger = new Logger(GlobalRolesService.name);

  constructor(
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
  ) {}

  /**
   * Los nombres de los roles globales de un usuario.
   *
   * ⚠️ **Falla cerrado.** Si permissions-service no responde devuelve la lista
   * vacía, que es el nivel de `User`: se pierde el acceso de administración
   * mientras el servicio esté caído, y eso es lo correcto — la alternativa sería
   * conceder privilegios por un fallo de infraestructura.
   *
   * Devolver `[]` y no lanzar es deliberado: el nivel de `User` es también el de
   * una cuenta normal recién registrada, que no tiene ninguna fila en
   * `UserRole`, así que el caso de error y el caso más común comparten camino y
   * no hay una rama que solo se ejecute cuando algo va mal.
   */
  async rolesOf(userId: string): Promise<string[]> {
    try {
      const roles = await firstValueFrom(
        this.permissionsClient.send<Array<{ name: string }>>(
          { cmd: 'permission_get_user_roles' },
          { userId },
        ),
      );
      return Array.isArray(roles) ? roles.map((role) => role.name) : [];
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer los roles globales de ${userId}, se asume el nivel mínimo: ${
          (error as Error).message
        }`,
      );
      return [];
    }
  }

  /** ¿Alcanza el mínimo que pide un endpoint? Cuenta la jerarquía. */
  async satisfies(userId: string, required: GlobalRole): Promise<boolean> {
    return satisfiesGlobalRole(await this.rolesOf(userId), required);
  }

  /**
   * ¿Puede `actorId` actuar sobre la cuenta de `targetId`?
   *
   * Exige nivel **estrictamente** superior, y comprueba antes que no sean la
   * misma persona: `outranks` ya lo impediría —nadie se supera a sí mismo— pero
   * comparar los ids es gratis, no depende de que los dos niveles se hayan
   * resuelto bien, y es lo que permite dar el mensaje concreto en vez de un
   * «no tienes nivel suficiente» sobre tu propia cuenta.
   *
   * Los dos lados en paralelo: son dos llamadas al mismo servicio y ninguna
   * depende de la otra.
   */
  async canActOn(actorId: string, targetId: string): Promise<boolean> {
    if (actorId === targetId) return false;

    const [actorRoles, targetRoles] = await Promise.all([
      this.rolesOf(actorId),
      this.rolesOf(targetId),
    ]);

    return outranks(actorRoles, targetRoles);
  }

  /**
   * ¿Puede `actorId` conceder o revocar el rol `role`?
   *
   * También estricto, así que nadie concede `SuperAdmin` desde una ruta: el
   * primero lo crea el seed. Sin esto, crear ese rol habría abierto un agujero
   * inmediato — `POST /permissions/assign` exige `Admin`, luego cualquier
   * administrador podría haberse concedido el nivel de encima.
   */
  async canGrant(actorId: string, role: GlobalRole): Promise<boolean> {
    return canGrantGlobalRole(await this.rolesOf(actorId), role);
  }
}
