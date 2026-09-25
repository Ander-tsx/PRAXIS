/// <reference types="jest" />

import { esDireccionPublica, leerVistaPrevia } from './link-preview';

/**
 * La vista previa de enlaces lee páginas ajenas desde dentro de la red. Si
 * estas comprobaciones fallan, un enlace a `169.254.169.254` o a `localhost`
 * hace que el gateway lea lo que no debe (E7 de `docs/PLAN-DOCUMENTOS.md`).
 */
describe('vista previa de enlaces', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rechaza la dirección interna %s', (ip) => {
    expect(esDireccionPublica(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('acepta la pública %s', (ip) => {
    expect(esDireccionPublica(ip)).toBe(true);
  });

  it.each([
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data',
    'file:///etc/passwd',
    'http://example.com:8080/',
    'ftp://example.com/',
  ])('no lee %s', async (url) => {
    await expect(leerVistaPrevia(url)).resolves.toBeNull();
  });

  it('no lee un nombre que resuelve a la propia máquina', async () => {
    await expect(leerVistaPrevia('http://localhost:3003/')).resolves.toBeNull();
  });
});
