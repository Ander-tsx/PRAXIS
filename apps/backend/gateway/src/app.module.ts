import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from '@praxis/observability';
import { envValidationSchema } from './common/config/env.validation';
import { IdentityThrottlerGuard } from './common/guards/identity-throttler.guard';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AssistantModule } from './assistant/assistant.module';
import { AuthModule } from './auth/auth.module';
import { AutomationModule } from './automation/automation.module';
import { BillingModule } from './billing/billing.module';
import { McpModule } from './mcp/mcp.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PresenceModule } from './presence/presence.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { UserModule } from './users/user.module';

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
     * ⚠️ **Y son 300 por cuenta, no por dirección IP.** Lo eran por IP, y como
     * el navegador nunca habla directo con el gateway —todo cruza el proxy de la
     * zona o nace en el renderizado de servidor de Next— esa IP era **la misma
     * para toda la plataforma**: los 300 se repartían entre todos los usuarios a
     * la vez. Se agotaban en segundos y el gateway empezaba a responder 429 a
     * peticiones legítimas, que las pantallas se tragan en silencio. Detalle
     * entero en `IdentityThrottlerGuard`.
     *
     * El apretón para `login` y `refresh` —donde adivinar sale a cuenta— se
     * pone con `@Throttle` en `auth.controller.ts`. Esos siguen contando por IP
     * porque quien los llama todavía no tiene sesión con la que identificarse.
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
    PresenceModule,
    PermissionsModule,
    ProjectsModule,
    TasksModule,
    NotificationsModule,
    AssistantModule,
    AutomationModule,
    AdminModule,
    BillingModule,
    McpModule,
  ],
  /* El health check. ⚠️ Estaba escrito y **sin declarar aquí**, así que la ruta
     salía en el inventario al escanear decoradores y respondía 404. Ver la nota
     de `app.controller.ts`. */
  controllers: [AppController],
  providers: [
    AppService,
    /* Lo que hace que `ThrottlerModule` sirva de algo. Sin esta línea la
       política existe y nadie la aplica.

       ⚠️ Es `IdentityThrottlerGuard` y no el `ThrottlerGuard` de la librería:
       cuenta por cuenta y no por IP. Puede inyectar `JwtService` porque
       `AuthModule` —importado arriba— exporta `JwtModule`. */
    { provide: APP_GUARD, useClass: IdentityThrottlerGuard },
  ],
})
export class AppModule {}
