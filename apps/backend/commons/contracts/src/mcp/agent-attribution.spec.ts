import { agentKindFromName, asAgentKind } from './agent-attribution';

describe('agentKindFromName', () => {
  it.each([
    ['Claude', 'claude'],
    ['Claude Code', 'claude'],
    ['claude desktop (portátil)', 'claude'],
    ['ChatGPT', 'chatgpt'],
    ['Codex', 'chatgpt'],
    ['Cursor', 'ai'],
    ['mi script', 'ai'],
  ])('%s → %s', (nombre, tipo) => {
    expect(agentKindFromName(nombre)).toBe(tipo);
  });

  it('lo desconocido que llega de fuera es el genérico', () => {
    expect(asAgentKind('claude')).toBe('claude');
    expect(asAgentKind('humano')).toBe('ai');
    expect(asAgentKind(undefined)).toBe('ai');
  });
});
