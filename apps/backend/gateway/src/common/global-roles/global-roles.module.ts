import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GlobalRolesService } from './global-roles.service';

/**
 * Registra su propio `PERMISSIONS_SERVICE` y exporta las dos cosas.
 *
 * El cliente se registra aquí en vez de importarlo de `PermissionsModule` para
 * no crear un ciclo: ese módulo necesita este para su guard. Es además el patrón
 * que ya sigue el resto del gateway — cada módulo registra los clientes que usa.
 *
 * Se exporta también `ClientsModule` porque los módulos que importan este
 * suelen necesitar el mismo cliente para sus controladores (`PermissionsModule`
 * lo usa para las rutas de roles), y así no lo registran dos veces.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'PERMISSIONS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PERMISSIONS_SERVICE_HOST'),
            port: config.get<number>('PERMISSIONS_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  providers: [GlobalRolesService],
  exports: [GlobalRolesService, ClientsModule],
})
export class GlobalRolesModule {}
