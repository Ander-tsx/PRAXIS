import type { ConfigService } from '@nestjs/config';
import { RouterDeContexto } from './router';

/**
 * El router de contexto (F5 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Lo que tiene que ser verdad pase lo que pase: **por defecto no quita nada**, y
 * si Jev falla o tarda, **decide el heurístico y el turno sigue** (I4).
 */
function router(valores: Record<string, string>) {
  const config = { get: (clave: string) => valores[clave] } as unknown as ConfigService;
  return new RouterDeContexto(config);
}

function jevResponde(choice: string, confidence: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ answers: { intent: { type: 'choice', choice, confidence } } }),
  } as Response;
}

const CON_JEV = { PRAX_ROUTER: 'jev', OPENROUTER_API_KEY: 'sk-prueba' };

describe('RouterDeContexto', () => {
  afterEach(() => jest.restoreAllMocks());

  it('por defecto no quita nunca el inventario, ni pregunta a nadie', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const d = await router({}).decidir({ mensaje: 'hola', conProyecto: true });
    expect(d).toMatchObject({ incluirInventario: true, router: 'heuristic' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sin clave de OpenRouter, aunque se pida jev, decide el heurístico', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const d = await router({ PRAX_ROUTER: 'jev' }).decidir({ mensaje: 'hola', conProyecto: true });
    expect(d.router).toBe('heuristic');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('una charla segura deja el inventario fuera', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jevResponde('chat', 0.97));
    const d = await router(CON_JEV).decidir({ mensaje: '¡gracias!', conProyecto: true });
    expect(d).toMatchObject({ incluirInventario: false, intencion: 'charla', router: 'jev' });
  });

  it('una charla dudosa no: ante la duda, inventario entero', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jevResponde('chat', 0.6));
    const d = await router(CON_JEV).decidir({ mensaje: 'vale, ¿y lo otro?', conProyecto: true });
    expect(d.incluirInventario).toBe(true);
  });

  it('una pregunta sobre el proyecto lleva el inventario', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jevResponde('question', 0.99));
    const d = await router(CON_JEV).decidir({ mensaje: '¿qué está bloqueado?', conProyecto: true });
    expect(d).toMatchObject({ incluirInventario: true, intencion: 'pregunta' });
  });

  it('🔴 si Jev falla, decide el heurístico y el turno sigue', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('timeout'));
    const d = await router(CON_JEV).decidir({ mensaje: 'hola', conProyecto: true });
    expect(d).toMatchObject({ incluirInventario: true, router: 'heuristic' });
  });

  it('sin proyecto no hay inventario que decidir: ni se pregunta', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const d = await router(CON_JEV).decidir({ mensaje: 'hola', conProyecto: false });
    expect(d.incluirInventario).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
