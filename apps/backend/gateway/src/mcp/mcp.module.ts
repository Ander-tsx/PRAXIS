import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { KylooInternalController } from './kyloo-internal.controller';
import { KylooInternalGuard } from './kyloo-internal.guard';
import { KylooOAuthService } from './kyloo-oauth.service';
import { McpAccessService } from './mcp-access.service';
import { McpConnectionsController } from './mcp-connections.controller';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { PersonalTokensController } from './personal-tokens.controller';

/**
 * Praxis como servidor MCP (docs/PLAN-MCP.md).
 *
 * Una ruta más del gateway y no un servicio aparte (M1): en el monolito un
 * servicio nuevo es RAM y tres sitios que registrar.
 */
@Module({
  imports: [
    AuthModule,
    /* Por `QuotaService`: el plan y la organización de un proyecto. */
    BillingModule,
    ClientsModule.registerAsync([
      clienteDeServicio('CREDENTIALS'),
      clienteDeServicio('BILLING'),
      clienteDeServicio('PROJECTS'),
      clienteDeServicio('TASKS'),
    ]),
  ],
  controllers: [
    McpController,
    PersonalTokensController,
    McpConnectionsController,
    KylooInternalController,
  ],
  providers: [McpAccessService, McpService, KylooOAuthService, KylooInternalGuard],
})
export class McpModule {}
