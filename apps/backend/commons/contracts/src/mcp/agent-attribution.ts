/**
 * Quién es el agente de IA que actúa por el MCP (docs/PLAN-MCP.md, «Coautoría»).
 *
 * ## La marca la firma el servidor
 *
 * El JWT que se canjea en cada llamada al MCP lleva `via: 'mcp'` y los datos del
 * agente. Ese JWT no sale nunca del gateway —el agente no lo ve— y lo firma
 * credentials con `JWT_SECRET`, así que ni el agente ni quien le dio el token
 * pueden quitarla ni inventarla. Lo que sí es **descriptivo y no probatorio** es
 * el nombre: en un token personal lo escribe la persona, y por OAuth lo da el
 * cliente. Por eso la marca dura es `via` y la insignia sale de `kind`.
 */
export const AGENT_KINDS = ['claude', 'chatgpt', 'ai'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/** Lo que viaja firmado dentro del JWT de una llamada por MCP. */
export interface AgentClaim {
  via: 'mcp';
  /** El token personal o la conexión OAuth. */
  agentId: string;
  agentName: string;
  agentKind: AgentKind;
}

/**
 * La insignia a partir del nombre con el que se conectó. «Claude Code», «Claude
 * Desktop» y «Claude» son Claude; «ChatGPT» y «OpenAI/Codex» son ChatGPT; lo
 * demás (Cursor, un nombre libre…) lleva el icono genérico de IA.
 */
export function agentKindFromName(name: string): AgentKind {
  if (/claude|anthropic/i.test(name)) return 'claude';
  if (/chatgpt|openai|codex|gpt/i.test(name)) return 'chatgpt';
  return 'ai';
}

/** Valida un `agentKind` que llegó de fuera; lo desconocido es el genérico. */
export function asAgentKind(value: unknown): AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(value as string) ? (value as AgentKind) : 'ai';
}

/** Un agente que editó una tarea, tal y como lo lee la interfaz. */
export interface TaskAgentEditor {
  userId: string;
  agentKind: AgentKind;
  agentName: string;
  lastAt: string;
}
