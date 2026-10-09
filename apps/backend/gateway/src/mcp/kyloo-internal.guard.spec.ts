import { createHmac } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CABECERA_FIRMA, CABECERA_HORA, KylooInternalGuard } from './kyloo-internal.guard';

const SECRETO = 'un-secreto-compartido-de-al-menos-32-caracteres';

function contexto(opciones: {
  hora?: string;
  firma?: string;
  metodo?: string;
  ruta?: string;
  cuerpo?: string;
}) {
  const req = {
    headers: { [CABECERA_HORA]: opciones.hora, [CABECERA_FIRMA]: opciones.firma },
    method: opciones.metodo ?? 'POST',
    originalUrl: opciones.ruta ?? '/api/internal/kyloo/organizations',
    rawBody: Buffer.from(opciones.cuerpo ?? '{}'),
  };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function firmar(hora: string, metodo: string, ruta: string, cuerpo: string, secreto = SECRETO) {
  return createHmac('sha256', secreto).update(`${hora}.${metodo}.${ruta}.${cuerpo}`).digest('hex');
}

describe('KylooInternalGuard', () => {
  const guard = new KylooInternalGuard(new ConfigService({ KYLOO_INTERNAL_SECRET: SECRETO }));
  const ahora = () => String(Date.now());

  it('deja pasar una firma válida', () => {
    const hora = ahora();
    const firma = firmar(hora, 'POST', '/api/internal/kyloo/organizations', '{}');
    expect(guard.canActivate(contexto({ hora, firma }))).toBe(true);
  });

  it.each([
    [
      'firmada con otro secreto',
      (h: string) =>
        firmar(
          h,
          'POST',
          '/api/internal/kyloo/organizations',
          '{}',
          'otro-secreto-otro-secreto-otro-secreto-xx',
        ),
    ],
    ['de otra ruta', (h: string) => firmar(h, 'POST', '/api/internal/kyloo/connections', '{}')],
    ['de otro método', (h: string) => firmar(h, 'GET', '/api/internal/kyloo/organizations', '{}')],
    [
      'de otro cuerpo',
      (h: string) => firmar(h, 'POST', '/api/internal/kyloo/organizations', '{"x":1}'),
    ],
    ['que no es hexadecimal', () => 'zzzz'],
    ['vacía', () => ''],
  ])('rechaza una firma %s', (_caso, hacer) => {
    const hora = ahora();
    expect(() => guard.canActivate(contexto({ hora, firma: hacer(hora) }))).toThrow();
  });

  it('rechaza una firma buena pero vieja: no se puede reproducir mañana', () => {
    const hora = String(Date.now() - 5 * 60_000);
    const firma = firmar(hora, 'POST', '/api/internal/kyloo/organizations', '{}');
    expect(() => guard.canActivate(contexto({ hora, firma }))).toThrow();
  });

  it('sin secreto configurado responde 503, no deja la puerta abierta', () => {
    const sinSecreto = new KylooInternalGuard(new ConfigService({}));
    expect(() => sinSecreto.canActivate(contexto({ hora: ahora(), firma: 'aa' }))).toThrow(
      /no está activa/,
    );
  });
});
