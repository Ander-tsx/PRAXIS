import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { GlobalRolesModule } from '../common/global-roles/global-roles.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityRecorder } from './admin-activity.recorder';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { AdminProjectsController } from './admin-projects.controller';
import { AdminUsersController } from './admin-users.controller';

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
 * ## Los servicios que necesita
 *
 * Este módulo cruza datos de varios sitios, y es lo normal en el gateway: las
 * cuentas están en credentials y los roles en permissions. `AuthModule` aporta
 * `CREDENTIALS_SERVICE` (y el `JwtGuard`) y `GlobalRolesModule` aporta
 * `PERMISSIONS_SERVICE` y los helpers de jerarquía.
 */
@Module({
  imports: [
    AuthModule,
    GlobalRolesModule,
    /* Por `TaskPurgeService` y `AutomationPurgeService`: borrar un proyecto
       desde administración arrastra sus tareas y sus reglas igual que el
       `DELETE` del dueño, y es el mismo código. */
    ProjectsModule,
    ClientsModule.registerAsync([
      {
        name: 'PROJECTS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PROJECTS_SERVICE_HOST'),
            port: config.get<number>('PROJECTS_SERVICE_PORT'),
          },
        }),
      },
      /* Para la pantalla de organizaciones de plataforma. Solo lectura: el rol
         global lo comprueba el guard, no billing-service. */
      {
        name: 'BILLING_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('BILLING_SERVICE_HOST'),
            port: config.get<number>('BILLING_SERVICE_PORT'),
          },
        }),
      },
      /* El plan del asistente vive en assistant-service, con su propia tabla de
         suscripciones. Se registra aquí porque su módulo no lo exporta. */
      {
        name: 'ASSISTANT_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('ASSISTANT_SERVICE_HOST'),
            port: config.get<number>('ASSISTANT_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [
    AdminActivityController,
    AdminUsersController,
    AdminProjectsController,
    AdminOrganizationsController,
  ],
  providers: [AdminActivityRecorder],
  exports: [AdminActivityRecorder],
})
export class AdminModule {}
