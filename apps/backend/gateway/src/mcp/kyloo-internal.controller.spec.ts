import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { KylooInternalController } from './kyloo-internal.controller';
import type { ConnectClaims, KylooOAuthService } from './kyloo-oauth.service';
import { McpAccessError, type McpAccessService } from './mcp-access.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

const claims: ConnectClaims = {
  sub: 'sub-ana',
  email: 'ana@kyloo.test',
  clientId: 'cliente-ia',
  clientName: 'ChatGPT',
  connectId: 'conexion-1',
  returnUrl: 'https://accounts.kyloo.test/conectar?client_id=cliente-ia',
};

function montar(opciones: { identificada?: boolean; bloqueadas?: string[] } = {}) {
  const { identificada = true, bloqueadas = [] } = opciones;
  const enviados: Array<{ cmd: string; payload: unknown }> = [];
  const credentials = {
    send: jest.fn((pattern: { cmd: string }, payload: unknown) => {
      enviados.push({ cmd: pattern.cmd, payload });
      if (pattern.cmd === 'mcp_conn_identify') return of(identificada ? { userId: 'u-1' } : null);
      if (pattern.cmd === 'mcp_conn_list') return of([]);
      if (pattern.cmd === 'mcp_conn_save') return of({ id: 'conn-77' });
      if (pattern.cmd === 'auth_revoke_all_of') return of({ revocadas: true });
      return throwError(() => new Error(`comando inesperado ${pattern.cmd}`));
    }),
  } as unknown as ClientProxy;
  const billing = {
    send: jest.fn(() =>
      of([
        { id: ORG_A, name: 'Personal', kind: 'PERSONAL' },
        { id: ORG_B, name: 'Equipo', kind: 'TEAM' },
      ]),
    ),
  } as unknown as ClientProxy;
  const access = {
    exigirOrganizacionUsable: jest.fn(async (_user: string, org: string) => {
      if (bloqueadas.includes(org)) throw new McpAccessError(403, 'PLAN', 'Tu plan no incluye MCP');
    }),
  } as unknown as McpAccessService;
  const kyloo = {
    verifyConnectToken: jest.fn(async (token: string) => {
      if (token !== 'bueno') throw new UnauthorizedException();
      return claims;
    }),
    verifyEventToken: jest.fn(async (token: string) => {
      if (!token.startsWith('evento:')) throw new UnauthorizedException();
      return { event: token.slice(7), sub: 'sub-ana', email: 'ana@kyloo.test', id: 'evt-1' };
    }),
    completeConnection: jest.fn(async () => undefined),
  } as unknown as KylooOAuthService;
  const controller = new KylooInternalController(credentials, billing, access, kyloo);
  return { controller, enviados, kyloo };
}

describe('KylooInternalController', () => {
  describe('organizations', () => {
    it('ofrece las organizaciones de quien dice el token, con el porqué de las no disponibles', async () => {
      const { controller } = montar({ bloqueadas: [ORG_B] });
      const respuesta = await controller.organizations({ token: 'bueno' });
      expect(respuesta).toMatchObject({
        clientName: 'ChatGPT',
        current: null,
        organizations: [
          { id: ORG_A, personal: true, available: true },
          { id: ORG_B, personal: false, available: false, reason: 'Tu plan no incluye MCP' },
        ],
      });
    });

    it('🔴 un token que no vale no llega a tocar ningún servicio', async () => {
      const { controller, enviados } = montar();
      await expect(controller.organizations({ token: 'falso' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(enviados).toHaveLength(0);
    });

    it('sin cuenta de Praxis para ese correo, lo dice con un código que la pantalla entiende', async () => {
      const { controller } = montar({ identificada: false });
      await expect(controller.organizations({ token: 'bueno' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('save', () => {
    it('guarda la conexión con la identidad del token, la cierra en Kyloo y devuelve adónde seguir', async () => {
      const { controller, enviados, kyloo } = montar();
      const respuesta = await controller.save({
        token: 'bueno',
        orgIds: [ORG_A, ORG_B],
        activeOrgId: ORG_B,
      });
      expect(respuesta).toEqual({ returnUrl: claims.returnUrl });
      expect(enviados.find((e) => e.cmd === 'mcp_conn_save')?.payload).toMatchObject({
        userId: 'u-1',
        kylooSub: 'sub-ana',
        clientId: 'cliente-ia',
        clientName: 'ChatGPT',
        allowedOrgIds: [ORG_A, ORG_B],
        activeOrgId: ORG_B,
      });
      expect(kyloo.completeConnection).toHaveBeenCalledWith('conexion-1', 'conn-77');
    });

    it('🔴 no admite una organización que no es suya o no es usable', async () => {
      const { controller, enviados } = montar({ bloqueadas: [ORG_B] });
      await expect(
        controller.save({ token: 'bueno', orgIds: [ORG_A, ORG_B], activeOrgId: ORG_A }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(enviados.some((e) => e.cmd === 'mcp_conn_save')).toBe(false);
    });

    it('la organización activa tiene que estar entre las elegidas', async () => {
      const { controller } = montar();
      await expect(
        controller.save({ token: 'bueno', orgIds: [ORG_A], activeOrgId: ORG_B }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('🔴 con un token que no vale no guarda nada', async () => {
      const { controller, enviados } = montar();
      await expect(
        controller.save({ token: 'falso', orgIds: [ORG_A], activeOrgId: ORG_A }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(enviados).toHaveLength(0);
    });
  });

  describe('event', () => {
    it.each(['user.credentials_changed', 'user.suspended', 'user.deleted'])(
      '%s cierra todo lo que esa persona tenía abierto',
      async (evento) => {
        const { controller, enviados } = montar();
        await expect(controller.event({ token: `evento:${evento}` })).resolves.toEqual({
          ok: true,
        });
        expect(enviados.find((e) => e.cmd === 'auth_revoke_all_of')?.payload).toEqual({
          sub: 'sub-ana',
          email: 'ana@kyloo.test',
        });
      },
    );

    it('un evento que no conoce se reconoce sin hacer nada, para que no se reintente', async () => {
      const { controller, enviados } = montar();
      await expect(controller.event({ token: 'evento:user.updated' })).resolves.toEqual({
        ok: true,
      });
      expect(enviados).toHaveLength(0);
    });

    it('🔴 un token falso no cierra la sesión de nadie', async () => {
      const { controller, enviados } = montar();
      await expect(controller.event({ token: 'falso' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(enviados).toHaveLength(0);
    });
  });
});
