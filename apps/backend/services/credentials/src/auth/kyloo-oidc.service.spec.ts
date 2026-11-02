import { createTestIssuer } from '@kyloo/auth/testing';
import { ConfigService } from '@nestjs/config';
import { KylooOidcService } from './kyloo-oidc.service';

const ISSUER = 'https://accounts.kyloo.test/api/auth';
const CLIENT_ID = 'praxis-client';
const NONCE = 'nonce-de-este-intento';
const entrada = {
  code: 'c',
  codeVerifier: 'v',
  redirectUri: 'https://praxis.test/cb',
  nonce: NONCE,
};

const config = new ConfigService({
  KYLOO_ISSUER: ISSUER,
  KYLOO_CLIENT_ID: CLIENT_ID,
  KYLOO_CLIENT_SECRET: 'secreto',
});

describe('KylooOidcService.perfilDesdeCodigo', () => {
  let emisor: Awaited<ReturnType<typeof createTestIssuer>>;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    emisor = await createTestIssuer({ issuer: ISSUER, clientId: CLIENT_ID });
  });

  afterEach(() => fetchSpy?.mockRestore());

  /** Kyloo falso: el descubrimiento y el canje del código devuelven este id_token. */
  const kylooDevuelve = (idToken: string | undefined, tokenStatus = 200) => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const direccion = String(url);
      if (direccion.endsWith('/.well-known/openid-configuration')) {
        return Response.json({ issuer: ISSUER, token_endpoint: `${ISSUER}/oauth2/token` });
      }
      return Response.json(idToken ? { id_token: idToken } : {}, { status: tokenStatus });
    });
  };

  const servicio = () => new KylooOidcService(config, { keys: emisor.keys });

  it('devuelve sub, correo y nombre del id_token, sin llamar a userinfo', async () => {
    kylooDevuelve(await emisor.idToken(NONCE, { email: 'ANA@Ejemplo.com', name: 'Ana Pérez' }));
    await expect(servicio().perfilDesdeCodigo(entrada)).resolves.toEqual({
      sub: 'persona-1',
      email: 'ana@ejemplo.com',
      name: 'Ana Pérez',
    });
    const llamadas = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(llamadas.some((url) => url.includes('userinfo'))).toBe(false);
  });

  it.each([
    ['de otro intento (nonce distinto)', { nonce: 'de-otro-intento' }],
    ['sin nonce', { nonce: undefined }],
    ['con el correo sin verificar', { email_verified: false }],
    ['sin correo', { email: undefined }],
  ])('🔴 rechaza un id_token %s con 401', async (_caso, cambios) => {
    kylooDevuelve(await emisor.idToken(NONCE, cambios));
    await expect(servicio().perfilDesdeCodigo(entrada)).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
  });

  it('🔴 rechaza el id_token que Kyloo emitió para otra aplicación (Oskel)', async () => {
    const oskel = await createTestIssuer({ issuer: ISSUER, clientId: 'oskel-client' });
    kylooDevuelve(await oskel.idToken(NONCE));
    await expect(
      new KylooOidcService(config, { keys: oskel.keys }).perfilDesdeCodigo(entrada),
    ).rejects.toMatchObject({ error: { statusCode: 401 } });
  });

  it('🔴 rechaza un id_token firmado con otra clave', async () => {
    const intruso = await createTestIssuer({ issuer: ISSUER, clientId: CLIENT_ID });
    kylooDevuelve(await intruso.idToken(NONCE));
    await expect(servicio().perfilDesdeCodigo(entrada)).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
  });

  it('si Kyloo no devuelve id_token, 401', async () => {
    kylooDevuelve(undefined);
    await expect(servicio().perfilDesdeCodigo(entrada)).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
  });

  it('un código que Kyloo rechaza es 401', async () => {
    kylooDevuelve(undefined, 400);
    await expect(servicio().perfilDesdeCodigo(entrada)).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
  });
});

describe('KylooOidcService sin configurar', () => {
  it('responde 503 en vez de romper el arranque', async () => {
    const servicio = new KylooOidcService(new ConfigService({}));
    await expect(servicio.perfilDesdeCodigo(entrada)).rejects.toMatchObject({
      error: { statusCode: 503 },
    });
  });
});
