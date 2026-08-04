import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GlobalRolesModule } from '../common/global-roles/global-roles.module';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityRecorder } from './admin-activity.recorder';

/**
 * El namespace `/admin`: todo lo que solo pueden hacer los administradores de la
 * plataforma.
 *
 * ## Por qué es un módulo aparte y no rutas repartidas
 *
 * Porque el rol global se declara **una vez a nivel de controlador** y no hay que
 * acordarse de ponerlo en cada handler: olvidarlo no da error, da una ruta de
 * administración abierta. `GlobalRoleGuard` lee la metadata también de la clase
 * justo para esto.
 *
 * Y porque las operaciones de administración **no son las mismas rutas con más
 * permisos**. `PATCH /users/:id` deja pasar al dueño de la cuenta, así que
 * cualquier campo que se le añada queda auto-editable: por ahí, un suspendido se
 * reactivaría a sí mismo. Las de aquí tienen otras reglas —solo hacia abajo,
 * nunca sobre uno mismo, motivo obligatorio— y viven en otro sitio.
 *
 * `GlobalRolesModule` aporta el cliente de permissions-service y los helpers de
 * jerarquía.
 */
@Module({
  imports: [AuthModule, GlobalRolesModule],
  controllers: [AdminActivityController],
  providers: [AdminActivityRecorder],
  exports: [AdminActivityRecorder],
})
export class AdminModule {}
