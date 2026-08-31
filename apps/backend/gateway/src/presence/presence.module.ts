import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BillingModule } from '../billing/billing.module';
import { PresenceService } from './presence.service';

/**
 * La presencia, gobernada por el servidor.
 *
 * `@Global` porque la consultan sitios que no tienen nada que ver entre sí: el
 * flujo de eventos —para marcar quién tiene una conexión abierta— y el
 * controlador de usuarios —para cruzarla con lo elegido antes de devolver un
 * perfil—. Importarlo en cada uno sería ceremonia por un servicio sin estado
 * propio.
 *
 * ⚠️ Registra sus **propios** clientes TCP en vez de importarlos de
 * `ProjectsModule` o `AuthModule`: aquellos no exportan su `ClientsModule`, y
 * abrirlos para esto acoplaría dos módulos de negocio a uno de infraestructura.
 * Es el mismo criterio que ya sigue `NotificationsModule`.
 *
 * - `credentials` da la presencia **elegida** (la columna `User.presence`).
 * - `projects` dice **a quién avisar** de un cambio: solo a quien comparte
 *   proyecto, que es la misma regla que decide con quién puedes hablar.
 */
@Global()
@Module({
  imports: [
    /* Por `QuotaService`, que resuelve con quién compartes organización — la
       misma regla con la que el chat decide a quién puedes escribir. */
    BillingModule,
    ClientsModule.registerAsync([
      {
        name: 'CREDENTIALS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('CREDENTIALS_SERVICE_HOST'),
            port: config.get<number>('CREDENTIALS_SERVICE_PORT'),
          },
        }),
      },
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
    ]),
  ],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
