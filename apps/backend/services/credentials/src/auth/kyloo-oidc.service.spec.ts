import { ConfigService } from '@nestjs/config';
import { type KeyLike, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { KylooOidcService } from './kyloo-oidc.service';

const ISSUER = 'https://accounts.kyloo.test/api/auth';
const CLIENT_ID = 'praxis-client';
const NONCE = 'nonce-de-este-intento';

describe('KylooOidcService.verificar', () => {
  let privada: KeyLike;
  let ajena: KeyLike;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  const servicio = new KylooOidcService(new ConfigService({}));
  const esperado = { issuer: ISSUER, clientId: CLIENT_ID, nonce: NONCE };

  beforeAll(async () => {
    const par = await generateKeyPair('RS256');
    privada = par.privateKey;
    ajena = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    jwks = createLocalJWKSet({ keys: [jwk] });
  });

  const firmar = (
    claims: Record<string, unknown> = {},
    opciones: { key?: KeyLike; iss?: string; aud?: string; exp?: string } = {},
  ) =>
    new SignJWT({ nonce: NONCE, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('sub-ana')
      .setIssuer(opciones.iss ?? ISSUER)
      .setAudience(opciones.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opciones.exp ?? '10m')
      .sign(opciones.key ?? privada);

  const verificar = (token: string) => servicio.verificar(token, { jwks_uri: '' }, esperado, jwks);

  it('acepta una identidad bien firmada, para nosotros y de este intento', async () => {
    await expect(verificar(await firmar())).resolves.toEqual({ sub: 'sub-ana' });
  });

  it.each([
    ['otro emisor', () => firmar({}, { iss: 'https://evil.test/api/auth' })],
    ['dirigido a otra aplicación (Oskel)', () => firmar({}, { aud: 'oskel-client' })],
    ['otro nonce', () => firmar({ nonce: 'de-otro-intento' })],
    ['sin nonce', () => firmar({ nonce: undefined })],
    ['firmado con otra clave', () => firmar({}, { key: ajena })],
    ['caducado', () => firmar({}, { exp: '-1m' })],
  ])('rechaza un id_token %s', async (_caso, crear) => {
    await expect(verificar(await crear())).rejects.toMatchObject({ error: expect.anything() });
  });
});

describe('KylooOidcService.exigirPerfil (lo que dice userinfo)', () => {
  const servicio = new KylooOidcService(new ConfigService({}));
  const ok = { sub: 'sub-ana', email: 'ANA@Ejemplo.com', email_verified: true, name: 'Ana Pérez' };

  it('acepta un perfil verificado y normaliza el correo', () => {
    expect(servicio.exigirPerfil('sub-ana', ok)).toEqual({
      sub: 'sub-ana',
      email: 'ana@ejemplo.com',
      name: 'Ana Pérez',
    });
  });

  it.each([
    ['otro sujeto: userinfo de otra persona', { ...ok, sub: 'sub-otra' }],
    ['correo sin verificar', { ...ok, email_verified: false }],
    ['sin la marca de verificación', { ...ok, email_verified: undefined }],
    ['sin correo', { ...ok, email: undefined }],
    ['nada', null],
  ])('rechaza %s', (_caso, info) => {
    expect(() => servicio.exigirPerfil('sub-ana', info)).toThrow();
  });
});

describe('KylooOidcService sin configurar', () => {
  it('responde 503 en vez de romper el arranque', async () => {
    const servicio = new KylooOidcService(new ConfigService({}));
    await expect(
      servicio.perfilDesdeCodigo({ code: 'c', codeVerifier: 'v', redirectUri: 'r', nonce: 'n' }),
    ).rejects.toMatchObject({ error: { statusCode: 503 } });
  });
});
