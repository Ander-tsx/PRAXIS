import {
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type KeyLike, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { KylooOAuthService } from './kyloo-oauth.service';

const ISSUER = 'https://accounts.kyloo.test/api/auth';
const RECURSO = 'https://usepraxis.test/api/mcp';

describe('KylooOAuthService.verificar', () => {
  let privada: KeyLike;
  let ajena: KeyLike;
  const servicio = new KylooOAuthService(
    new ConfigService({ KYLOO_ISSUER: ISSUER, MCP_RESOURCE_URL: RECURSO }),
  );

  beforeAll(async () => {
    const par = await generateKeyPair('RS256');
    privada = par.privateKey;
    ajena = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    // biome-ignore lint/suspicious/noExplicitAny: se sustituye el JWKS remoto por uno local
    (servicio as any).jwks = createLocalJWKSet({ keys: [jwk] });
  });

  const firmar = (
    claims: Record<string, unknown> = {},
    o: { key?: KeyLike; iss?: string; aud?: string | string[]; exp?: string } = {},
  ) =>
    new SignJWT({ scope: 'openid praxis:read', connection_id: 'conn-1', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('sub-ana')
      .setIssuer(o.iss ?? ISSUER)
      .setAudience(o.aud ?? RECURSO)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '5m')
      .sign(o.key ?? privada);

  it('acepta un token del emisor, para este recurso, con conexión', async () => {
    await expect(servicio.verificar(await firmar())).resolves.toEqual({
      sub: 'sub-ana',
      connectionId: 'conn-1',
      scope: 'openid praxis:read',
    });
  });

  it('acepta el nombre anterior de la claim mientras vivan los refresh tokens viejos', async () => {
    await expect(
      servicio.verificar(
        await firmar({ connection_id: undefined, praxis_connection: 'conn-vieja' }),
      ),
    ).resolves.toMatchObject({ connectionId: 'conn-vieja' });
  });

  it('acepta un aud que es una lista donde está el recurso', async () => {
    await expect(
      servicio.verificar(await firmar({}, { aud: ['https://otro', RECURSO] })),
    ).resolves.toMatchObject({ sub: 'sub-ana' });
  });

  it.each([
    [
      'dirigido a otro recurso (el id_token de otra aplicación de Kyloo)',
      () => firmar({}, { aud: 'https://oskel.test/api' }),
    ],
    ['de otro emisor', () => firmar({}, { iss: 'https://evil.test/api/auth' })],
    ['firmado con otra clave', () => firmar({}, { key: ajena })],
    ['caducado', () => firmar({}, { exp: '-1m' })],
    ['sin la conexión', () => firmar({ connection_id: undefined })],
  ])('rechaza un token %s', async (_caso, crear) => {
    await expect(servicio.verificar(await crear())).rejects.toMatchObject({ status: 401 });
  });

  it('sin servidor de autorización configurado solo admite tokens personales', async () => {
    const sin = new KylooOAuthService(new ConfigService({}));
    expect(sin.activo).toBe(false);
    await expect(sin.verificar(await firmar())).rejects.toMatchObject({ status: 401 });
  });
});

describe('KylooOAuthService: paso de conexión y eventos', () => {
  const CLIENT_ID = 'praxis-client';
  let privada: KeyLike;
  let ajena: KeyLike;
  const servicio = new KylooOAuthService(
    new ConfigService({
      KYLOO_ISSUER: ISSUER,
      MCP_RESOURCE_URL: RECURSO,
      KYLOO_CLIENT_ID: CLIENT_ID,
      KYLOO_CLIENT_SECRET: 'secreto',
    }),
  );

  beforeAll(async () => {
    const par = await generateKeyPair('RS256');
    privada = par.privateKey;
    ajena = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    // biome-ignore lint/suspicious/noExplicitAny: se sustituye el JWKS remoto por uno local
    (servicio as any).jwks = createLocalJWKSet({ keys: [jwk] });
  });

  const connectClaims = {
    token_use: 'connect',
    email: 'Ana@Kyloo.test',
    email_verified: true,
    client_id: 'cliente-ia',
    client_name: 'ChatGPT',
    connect_id: 'conexion-1',
    return_url: 'https://accounts.kyloo.test/conectar?client_id=cliente-ia',
  };

  const firmar = (
    claims: Record<string, unknown>,
    o: { key?: KeyLike; aud?: string; exp?: string } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('sub-ana')
      .setIssuer(ISSUER)
      .setAudience(o.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '5m')
      .sign(o.key ?? privada);

  describe('verifyConnectToken', () => {
    it('acepta el token de Kyloo y normaliza el correo', async () => {
      await expect(servicio.verifyConnectToken(await firmar(connectClaims))).resolves.toEqual({
        sub: 'sub-ana',
        email: 'ana@kyloo.test',
        clientId: 'cliente-ia',
        clientName: 'ChatGPT',
        connectId: 'conexion-1',
        returnUrl: connectClaims.return_url,
      });
    });

    it.each([
      ['dirigido a otra aplicación', () => firmar(connectClaims, { aud: 'oskel-client' })],
      ['firmado con otra clave', () => firmar(connectClaims, { key: ajena })],
      ['caducado', () => firmar(connectClaims, { exp: '-1m' })],
      ['de otro tipo (un evento)', () => firmar({ ...connectClaims, token_use: 'event' })],
      ['de un access token (sin token_use)', () => firmar({ scope: 'openid' })],
      ['con el correo sin verificar', () => firmar({ ...connectClaims, email_verified: false })],
      ['sin connect_id', () => firmar({ ...connectClaims, connect_id: undefined })],
      [
        'que devuelve a otro sitio',
        () => firmar({ ...connectClaims, return_url: 'https://evil.test/conectar' }),
      ],
    ])('rechaza un token %s', async (_caso, crear) => {
      await expect(servicio.verifyConnectToken(await crear())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEventToken', () => {
    const eventClaims = {
      token_use: 'event',
      event: 'user.credentials_changed',
      email: 'a@b.test',
    };

    it('acepta un evento y devuelve su identificador', async () => {
      await expect(
        servicio.verifyEventToken(await firmar({ ...eventClaims, jti: 'evt-1' })),
      ).resolves.toEqual({
        event: 'user.credentials_changed',
        sub: 'sub-ana',
        email: 'a@b.test',
        id: 'evt-1',
      });
    });

    it('rechaza un token de conexión usado como evento', async () => {
      await expect(
        servicio.verifyEventToken(await firmar({ ...connectClaims, jti: 'x' })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un evento sin identificador', async () => {
      await expect(servicio.verifyEventToken(await firmar(eventClaims))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('completeConnection', () => {
    const fetchOriginal = global.fetch;
    afterEach(() => {
      global.fetch = fetchOriginal;
    });

    it('cierra el paso en Kyloo con las credenciales de Praxis', async () => {
      const llamada = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = llamada as unknown as typeof fetch;
      await servicio.completeConnection('conexion-1', 'ref-9');

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
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
      await expect(servicio.completeConnection('x', 'y')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      global.fetch = jest.fn().mockRejectedValue(new Error('red')) as never;
      await expect(servicio.completeConnection('x', 'y')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  it('sin credenciales de cliente, el paso de conexión responde 503 y no queda abierto', async () => {
    const sinConfigurar = new KylooOAuthService(new ConfigService({ KYLOO_ISSUER: ISSUER }));
    await expect(sinConfigurar.verifyConnectToken('x')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(sinConfigurar.completeConnection('x', 'y')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
