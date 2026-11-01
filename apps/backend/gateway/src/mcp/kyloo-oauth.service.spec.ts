import { createTestIssuer } from '@kyloo/auth/testing';
import {
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KylooOAuthService } from './kyloo-oauth.service';

const ISSUER = 'https://accounts.kyloo.test/api/auth';
const CLIENT_ID = 'praxis-client';
const RECURSO = 'https://usepraxis.test/api/mcp';

const configuracion = (extra: Record<string, string> = {}) =>
  new ConfigService({
    KYLOO_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RECURSO,
    KYLOO_CLIENT_ID: CLIENT_ID,
    KYLOO_CLIENT_SECRET: 'secreto',
    ...extra,
  });

/**
 * Qué comprueba el SDK (firma, emisor, destinatario, caducidad, tipo de token) ya lo cubren sus
 * propias pruebas. Aquí se prueba lo de Praxis: cómo se traduce lo que dice a lo que Praxis usa, y
 * que cada fallo salga como el error de Nest que espera quien llama.
 */
describe('KylooOAuthService', () => {
  let emisor: Awaited<ReturnType<typeof createTestIssuer>>;
  let servicio: KylooOAuthService;

  beforeAll(async () => {
    emisor = await createTestIssuer({ issuer: ISSUER, clientId: CLIENT_ID, resource: RECURSO });
    servicio = new KylooOAuthService(configuracion(), { keys: emisor.keys });
  });

  describe('verificar (token de acceso del MCP)', () => {
    it('acepta un token del emisor, para este recurso, con conexión', async () => {
      const token = await emisor.accessToken({ scope: 'openid praxis:read' });
      await expect(servicio.verificar(token)).resolves.toEqual({
        sub: 'persona-1',
        connectionId: 'conexion-1',
        scope: 'openid praxis:read',
      });
    });

    it.each([
      [
        'dirigido a otro recurso (el id_token de otra aplicación de Kyloo)',
        () => emisor.sign({ sub: 'x', connection_id: 'c' }, 'https://oskel.test/api'),
      ],
      ['caducado', () => emisor.sign({ sub: 'x', connection_id: 'c' }, RECURSO, -60)],
      ['sin la conexión', () => emisor.accessToken({ connection_id: undefined })],
      ['que no es un token', async () => 'basura'],
    ])('rechaza un token %s con un 401 que no dice por qué', async (_caso, crear) => {
      await expect(servicio.verificar(await crear())).rejects.toMatchObject({ status: 401 });
    });

    it('sin servidor de autorización configurado solo admite tokens personales', async () => {
      const sin = new KylooOAuthService(new ConfigService({}));
      expect(sin.activo).toBe(false);
      await expect(sin.verificar(await emisor.accessToken())).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('verifyConnectToken', () => {
    it('devuelve quién llega y a qué app conecta, con el correo normalizado', async () => {
      const token = await emisor.connectToken({ email: 'Ana@Kyloo.test' });
      await expect(servicio.verifyConnectToken(token)).resolves.toMatchObject({
        sub: 'persona-1',
        email: 'ana@kyloo.test',
        clientName: 'ChatGPT',
        connectId: '11111111-1111-4111-8111-111111111111',
      });
    });

    it.each([
      ['dirigido a otra aplicación', () => emisor.sign({ token_use: 'connect' }, 'oskel-client')],
      ['de un evento', () => emisor.eventToken('user.deleted')],
      ['de un access token', () => emisor.accessToken()],
      ['con el correo sin verificar', () => emisor.connectToken({ email_verified: false })],
      [
        'que devuelve a otro sitio',
        () => emisor.connectToken({ return_url: 'https://evil.test/conectar' }),
      ],
    ])('rechaza un token %s', async (_caso, crear) => {
      await expect(servicio.verifyConnectToken(await crear())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEventToken', () => {
    it('acepta un evento y devuelve su identificador', async () => {
      const token = await emisor.eventToken('user.credentials_changed', { jti: 'evt-1' });
      await expect(servicio.verifyEventToken(token)).resolves.toMatchObject({
        event: 'user.credentials_changed',
        id: 'evt-1',
      });
    });

    it('rechaza un token de conexión usado como evento', async () => {
      await expect(servicio.verifyEventToken(await emisor.connectToken())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('completeConnection', () => {
    const conFetch = (respuesta: () => Promise<Response>) =>
      new KylooOAuthService(configuracion(), { keys: emisor.keys, fetch: jest.fn(respuesta) });

    it('cierra el paso en Kyloo con las credenciales de Praxis', async () => {
      const llamada = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const conLlamada = new KylooOAuthService(configuracion(), {
        keys: emisor.keys,
        fetch: llamada,
      });
      await conLlamada.completeConnection('conexion-1', 'ref-9');

      const [url, init] = llamada.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://accounts.kyloo.test/api/connect/complete');
      expect((init.headers as Record<string, string>).authorization).toBe(
        `Basic ${Buffer.from(`${CLIENT_ID}:secreto`).toString('base64')}`,
      );
      expect(JSON.parse(String(init.body))).toEqual({
        connect_id: 'conexion-1',
        reference_id: 'ref-9',
      });
    });

    it('si Kyloo lo rechaza o no responde, falla sin decir por qué', async () => {
      await expect(
        conFetch(async () => new Response('{}', { status: 404 })).completeConnection('x', 'y'),
      ).rejects.toBeInstanceOf(BadGatewayException);
      await expect(
        conFetch(async () => {
          throw new Error('red');
        }).completeConnection('x', 'y'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  it('sin credenciales de cliente, el paso de conexión responde 503 y no queda abierto', async () => {
    const sinConfigurar = new KylooOAuthService(new ConfigService({ KYLOO_ISSUER: ISSUER }));
    expect(sinConfigurar.connectEnabled).toBe(false);
    await expect(sinConfigurar.verifyConnectToken('x')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(sinConfigurar.verifyEventToken('x')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(sinConfigurar.completeConnection('x', 'y')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
