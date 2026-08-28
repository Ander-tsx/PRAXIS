import { Controller, Get, HttpCode, HttpStatus, Inject, Query, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GLOBAL_ROLES } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';
import { GlobalRoleGuard } from '../common/guards/global-role.guard';

interface PerfilCrudo {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  credential?: { email?: string | null } | null;
}

interface OrganizacionCruda {
  id: string;
  kind: string;
  name: string | null;
  slug: string | null;
  ownerUserId: string;
  tier: string;
  status: string;
  seats: number;
  seatsUsed: number;
  createdAt: string;
}

/**
 * Las organizaciones, vistas desde la administración de la plataforma.
 *
 * ## Qué es esto y qué no
 *
 * ⚠️ **No es el portal de una organización.** Aquel es *tu* espacio, con sus
 * proyectos y su gente, y lo abre quien pertenece a ella. Esto es la lista de
 * **todas** las que existen en la instalación, y la abre quien administra la
 * plataforma. Son dos pantallas distintas para dos preguntas distintas, y es la
 * misma separación que ya hay entre «tus proyectos» y `/admin/projects`.
 *
 * ## Solo lectura, y eso es una decisión
 *
 * 🔴 No hay aquí ningún botón de suspender ni de borrar. **La palanca que existe
 * es la del proyecto** (`Project.status`), y ya está en `/admin/projects`:
 * suspender una organización entera dejaría a diez equipos sin poder escribir
 * con un solo clic, y no hay ninguna pantalla que se lo explique a ninguno de
 * ellos. Cuando haga falta —abuso, impago crónico— habrá que diseñar antes qué
 * se les dice, igual que se hizo con `PROJECT_SUSPENDED`.
 *
 * Lo que sí resuelve es la pregunta que hoy no tiene respuesta: **quién ha
 * contratado qué**, y cuántos asientos hay ocupados frente a los pagados.
 *
 * ## El dueño se resuelve aquí, no en billing
 *
 * `billing-service` guarda `ownerUserId` y no sabe cómo se llama nadie: no
 * habla con `credentials`, a propósito. El nombre lo pega el gateway, que sí
 * tiene los dos clientes delante — igual que en la lista de miembros.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@RequireGlobalRole(GLOBAL_ROLES.ADMIN)
@UseGuards(JwtGuard, GlobalRoleGuard)
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Todas las organizaciones de la instalación' })
  @ApiResponse({ status: 200, description: 'Lista paginada, con su plan y sus asientos' })
  async listar(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pagina = await firstValueFrom(
      this.billingClient.send<{
        items: OrganizacionCruda[];
        total: number;
        page: number;
        limit: number;
      }>(
        { cmd: 'billing_org_all' },
        {
          page: page ? Number.parseInt(page, 10) : undefined,
          limit: limit ? Number.parseInt(limit, 10) : undefined,
          search,
        },
      ),
    );

    return { ...pagina, items: await this.conDueños(pagina.items) };
  }

  /**
   * Le pega a cada organización el nombre de quien la lleva.
   *
   * ⚠️ **En una sola petición para toda la página**, no una por fila: es la
   * misma lección que ya costó bajar una pantalla de `1 + 12 + K` llamadas a 2.
   *
   * ⚠️ Y si `credentials` no contesta, las filas salen **sin nombre** en vez de
   * no salir: una lista de administración sin nombres sigue diciendo cuántas
   * organizaciones hay y qué plan tienen, que es para lo que se abre.
   */
  private async conDueños(items: OrganizacionCruda[]) {
    const ids = [...new Set(items.map((organizacion) => organizacion.ownerUserId))];
    if (ids.length === 0) return items;

    const perfiles = await firstValueFrom(
      this.credentialsClient.send<PerfilCrudo[]>({ cmd: 'user_find_by_ids' }, { ids }),
    ).catch(() => [] as PerfilCrudo[]);

    const porId = new Map(perfiles.map((perfil) => [perfil.id, perfil]));

    return items.map((organizacion) => {
      const perfil = porId.get(organizacion.ownerUserId);
      const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
      return {
        ...organizacion,
        owner: {
          id: organizacion.ownerUserId,
          name: nombre || null,
          email: perfil?.credential?.email ?? null,
        },
      };
    });
  }
}
