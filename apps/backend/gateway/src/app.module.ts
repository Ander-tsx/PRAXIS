import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from '@praxis/observability';
import { envValidationSchema } from './common/config/env.validation';

import { AdminModule } from './admin/admin.module';
import { AssistantModule } from './assistant/assistant.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './users/user.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProjectsModule } from './projects/projects.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { TasksModule } from './tasks/tasks.module';
import { AlexaModule } from './alexa/alexa.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    /**
     * Límite de peticiones por IP.
     *
     * ⚠️ **Esto estaba importado y no aplicaba nada.** Definir la política no
     * basta: sin registrar el `ThrottlerGuard` (abajo, en `providers`) el módulo
     * es decorativo, y `/auth/login` aceptaba intentos ilimitados contra bcrypt.
     *
     * ⚠️ **Una sola política aquí, y a propósito.** Cada entrada de este array
     * se evalúa en **todas** las rutas; `@Throttle` solo permite reajustar por
     * handler la que ya existe. Añadir un segundo perfil `auth` de 10/min no
     * limitaba el login: dejaba toda la API en 10 peticiones por minuto, y la
     * suite de pruebas empezó a recibir 429 al registrar usuarios.
     *
     * 300/min es el techo de una API que una sola pantalla del panel consume a
     * ráfagas: el árbol del proyecto, los miembros, las etiquetas y los avisos
     * salen casi a la vez. Con 100 se estrangulaba a un usuario navegando
     * rápido.
     *
     * El apretón para `login` y `refresh` —donde adivinar sale a cuenta— se
     * pone con `@Throttle` en `auth.controller.ts`.
     *
     * El registro **no** lleva límite estricto: es el mismo camino que recorre
     * la suite al crear cuentas, y ahogarlo cambiaría el riesgo de fuerza bruta
     * por un CI que falla solo. El abuso de registro es otro problema —spam de
     * cuentas— y pide otra herramienta.
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

    // Módulos de negocio
    AuthModule,
    UserModule,
    PermissionsModule,
    ProjectsModule,
    TasksModule,
    NotificationsModule,
    ReportsModule,
    AssistantModule,
    AlexaModule,
    AdminModule,
  ],
  /* El health check. ⚠️ Estaba escrito y **sin declarar aquí**, así que la ruta
     salía en el inventario al escanear decoradores y respondía 404. Ver la nota
     de `app.controller.ts`. */
  controllers: [AppController],
  providers: [
    AppService,
    /* Lo que hace que `ThrottlerModule` sirva de algo. Sin esta línea la
       política existe y nadie la aplica. */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
