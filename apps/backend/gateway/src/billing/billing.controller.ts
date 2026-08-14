import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { StripeService } from './stripe.service';

/**
 * El plan del asistente, desde el lado de quien paga.
 *
 * Cuelga de `/me` y **nunca acepta un `userId`**: quien paga es siempre quien
 * trae el token. Un parámetro aquí sería poder abrir un pago —o el portal de
 * facturación, con sus recibos dentro— a nombre de otra persona.
 */
@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/billing')
export class BillingController {
  constructor(
    private readonly stripe: StripeService,
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  /**
   * Qué puede ofrecer la pantalla de Configuración.
   *
   * Existe para que la interfaz no tenga que adivinarlo: sin claves de Stripe el
   * botón de comprar no debe salir, y el de «gestionar suscripción» solo tiene
   * sentido para quien ya es cliente. Preguntarlo es más barato que enseñar un
   * botón que responde 503 al pulsarlo.
   */
  @Get('estado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Si el cobro está disponible y si ya eres cliente' })
  @ApiResponse({ status: 200, description: '{ disponible, gestionable }' })
  async estado(@Request() req: Express.Request) {
    if (!this.stripe.enabled) return { disponible: false, gestionable: false };

    const { stripeCustomerId } = await this.facturacion(req.user!.userId);
    return { disponible: true, gestionable: Boolean(stripeCustomerId) };
  }

  /**
   * Abre el pago del plan PRO y devuelve a dónde ir.
   *
   * Devuelve la URL en vez de redirigir: quien llama es un `fetch` desde el
   * navegador a través del proxy de la zona, y un 303 ahí lo seguiría el propio
   * `fetch` en vez de la pestaña.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre una página de pago de Stripe para el plan PRO' })
  @ApiResponse({ status: 200, description: '{ url } a la que mandar el navegador' })
  async checkout(@Request() req: Express.Request) {
    const userId = req.user!.userId;
    const [{ stripeCustomerId }, email] = await Promise.all([
      this.facturacion(userId),
      this.correo(userId),
    ]);

    return this.stripe.createCheckout({ userId, email, stripeCustomerId });
  }

  /** El portal de Stripe: tarjeta, recibos y baja. Solo para quien ya es cliente. */
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre el portal de facturación de Stripe' })
  @ApiResponse({ status: 200, description: '{ url } a la que mandar el navegador' })
  async portal(@Request() req: Express.Request) {
    const { stripeCustomerId } = await this.facturacion(req.user!.userId);

    if (!stripeCustomerId) {
      throw new BadRequestException('Todavía no tienes ninguna suscripción que gestionar.');
    }

    return this.stripe.createPortal(stripeCustomerId);
  }

  private facturacion(userId: string): Promise<{ stripeCustomerId: string | null }> {
    return firstValueFrom(
      this.assistantClient.send<{ stripeCustomerId: string | null }>(
        { cmd: 'assistant_billing_of' },
        { userId },
      ),
    ).catch(() => ({ stripeCustomerId: null }));
  }

  /**
   * El correo, solo para rellenarlo en la página de Stripe.
   *
   * Si no se puede resolver **no se cae nada**: Stripe lo pide en su propio
   * formulario. Perder el autorrelleno es un roce; perder el pago, no.
   */
  private correo(userId: string): Promise<string | undefined> {
    return firstValueFrom(
      this.credentialsClient.send<{ credential?: { email?: string } }>(
        { cmd: 'user_find_one' },
        { id: userId },
      ),
    )
      .then((perfil) => perfil?.credential?.email)
      .catch(() => undefined);
  }
}
