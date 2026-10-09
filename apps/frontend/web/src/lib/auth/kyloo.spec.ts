import { beforeAll, describe, expect, it } from 'vitest';
import {
  abrirIntento,
  desafioPkce,
  nuevoIntento,
  rutaSegura,
  sellarIntento,
  urlDeAutorizacion,
} from './kyloo';

beforeAll(() => {
  process.env.JWT_SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres';
});

describe('rutaSegura', () => {
  it.each([
    ['/projects', '/projects'],
    ['/chat/proyecto/1?x=2', '/chat/proyecto/1?x=2'],
  ])('deja pasar %s', (entrada, salida) => {
    expect(rutaSegura(entrada)).toBe(salida);
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ])('descarta %s: sería una redirección a otro sitio tras autenticarse', (entrada) => {
    expect(rutaSegura(entrada)).toBe('/projects');
  });
});

describe('PKCE', () => {
  it('el desafío S256 coincide con el vector del RFC 7636 (apéndice B)', () => {
    expect(desafioPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('el verificador cumple el largo mínimo y el alfabeto del RFC', () => {
    expect(nuevoIntento('/projects').codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
  });
});

describe('el intento sellado en la cookie', () => {
  it('vuelve idéntico', async () => {
    const intento = nuevoIntento('/projects');
    expect(await abrirIntento(await sellarIntento(intento))).toEqual(intento);
  });

  it('una cookie manipulada o ajena no abre', async () => {
    const sello = await sellarIntento(nuevoIntento('/projects'));
    const [cab, cuerpo, firma] = sello.split('.');
    const cuerpoAjeno = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(cuerpo ?? '', 'base64url').toString()),
        next: '/admin',
      }),
    ).toString('base64url');
    expect(await abrirIntento(`${cab}.${cuerpoAjeno}.${firma}`)).toBeNull();
    expect(await abrirIntento('basura')).toBeNull();
    expect(await abrirIntento(undefined)).toBeNull();
  });
});

describe('urlDeAutorizacion', () => {
  it('pide código + PKCE S256 con state y nonce del intento', () => {
    const intento = nuevoIntento('/projects');
    const url = new URL(
      urlDeAutorizacion(
        { issuer: 'https://accounts.kyloo.test/api/auth', clientId: 'praxis' },
        intento,
        'https://usepraxis.space/auth/api/kyloo/callback',
      ),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.kyloo.test/api/auth/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'praxis',
      response_type: 'code',
      scope: 'openid profile email',
      state: intento.state,
      nonce: intento.nonce,
      code_challenge: desafioPkce(intento.codeVerifier),
      code_challenge_method: 'S256',
      redirect_uri: 'https://usepraxis.space/auth/api/kyloo/callback',
    });
  });
});
