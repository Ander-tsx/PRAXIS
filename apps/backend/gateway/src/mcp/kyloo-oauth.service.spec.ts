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
    new SignJWT({ scope: 'openid praxis:read', praxis_connection: 'conn-1', ...claims })
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
    ['sin la conexión', () => firmar({ praxis_connection: undefined })],
  ])('rechaza un token %s', async (_caso, crear) => {
    await expect(servicio.verificar(await crear())).rejects.toMatchObject({ status: 401 });
  });

  it('sin servidor de autorización configurado solo admite tokens personales', async () => {
    const sin = new KylooOAuthService(new ConfigService({}));
    expect(sin.activo).toBe(false);
    await expect(sin.verificar(await firmar())).rejects.toMatchObject({ status: 401 });
  });
});
