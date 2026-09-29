import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Qué contexto viaja en cada turno (D10 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Qué decide, y por qué solo esto
 *
 * Lo caro de un turno con proyecto es el **inventario de tareas** del briefing:
 * viaja entero en cada mensaje (`INVENTARIO_MAX_CHARS`). Desde F3 PRAX puede
 * **consultar** las tareas cuando las necesita, así que quitárselas de delante
 * dejó de ser peligroso: si hacían falta, las pide. El router decide si este
 * turno las lleva.
 *
 * Solo se omiten cuando el mensaje es **charla** con confianza alta —un saludo,
 * un gracias— y el prompt lo dice (I3: ningún recorte mudo). Ante cualquier
 * duda, inventario entero, que es lo que se hacía antes.
 *
 * ## Dos routers, y el que manda siempre es el seguro
 *
 * - `heuristic` (por defecto): no omite nunca. Es el comportamiento de antes.
 * - `jev`: pregunta a Jev (TypeSafe, por OpenRouter) la intención del mensaje.
 *   Barato —unos $0,00002 por decisión— y rápido, pero con dos semanas de vida:
 *   **si tarda más de `JEV_TIMEOUT_MS` o falla, decide el heurístico y el turno
 *   sigue** (I4). Jev nunca deja a PRAX sin responder.
 *
 * Se elige con `PRAX_ROUTER=jev|heuristic`, y hace falta `OPENROUTER_API_KEY`.
 */
export type Intencion = 'charla' | 'pregunta' | 'cambio';

export interface DecisionDeContexto {
  incluirInventario: boolean;
  intencion: Intencion | null;
  router: 'heuristic' | 'jev';
  /** Por qué se decidió así, para el log. */
  motivo: string;
}

/** Con cuánta confianza tiene que ser charla para quitar el inventario. */
const UMBRAL_DE_CHARLA = 0.85;

@Injectable()
export class RouterDeContexto {
  private readonly log = new Logger(RouterDeContexto.name);
  private readonly modo: 'heuristic' | 'jev';
  private readonly clave: string | undefined;
  private readonly modelo: string;
  private readonly plazoMs: number;

  constructor(config: ConfigService) {
    this.clave = config.get<string>('OPENROUTER_API_KEY')?.trim() || undefined;
    this.modo = config.get<string>('PRAX_ROUTER') === 'jev' && this.clave ? 'jev' : 'heuristic';
    this.modelo = config.get<string>('JEV_MODEL')?.trim() || '~typesafe/jev-latest';
    this.plazoMs = Number(config.get<string>('JEV_TIMEOUT_MS') ?? 800) || 800;
  }

  async decidir(entrada: { mensaje: string; conProyecto: boolean }): Promise<DecisionDeContexto> {
    const seguro: DecisionDeContexto = {
      incluirInventario: true,
      intencion: null,
      router: 'heuristic',
      motivo: 'por defecto',
    };
    /* Sin proyecto no hay inventario que quitar. */
    if (this.modo !== 'jev' || !entrada.conProyecto) return seguro;

    const inicio = Date.now();
    try {
      const intencion = await this.preguntarAJev(entrada.mensaje);
      const decision: DecisionDeContexto = {
        incluirInventario: !(
          intencion.valor === 'charla' && intencion.confianza >= UMBRAL_DE_CHARLA
        ),
        intencion: intencion.valor,
        router: 'jev',
        motivo: `${intencion.valor} ${intencion.confianza.toFixed(2)}`,
      };
      this.log.log(
        `prax_router router=jev intencion=${intencion.valor} confianza=${intencion.confianza.toFixed(2)} ` +
          `inventario=${decision.incluirInventario} ms=${Date.now() - inicio}`,
      );
      return decision;
    } catch (error) {
      this.log.warn(
        `prax_router_jev_fallo ms=${Date.now() - inicio} ${(error as Error)?.message ?? error}: decide el heuristico`,
      );
      return { ...seguro, motivo: 'jev no respondio' };
    }
  }

  /**
   * La intención del mensaje, con `choice` de Jev.
   *
   * ⚠️ Las opciones y las instrucciones en **inglés**, y el mensaje tal cual: las
   * pruebas independientes dan a Jev 3-6 puntos menos en español, y sus opciones
   * son frágiles con la redacción. Probado a mano el 2026-09-29 (§5 del plan).
   */
  private async preguntarAJev(mensaje: string): Promise<{ valor: Intencion; confianza: number }> {
    const respuesta = await fetch('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelo,
        state: { user_message: mensaje.slice(0, 2000) },
        questions: {
          intent: {
            type: 'choice',
            instructions:
              'The user is talking to a project-management assistant about their project. ' +
              'What does the message need?',
            criteria: {
              chat: 'Small talk, greetings or thanks. Needs no project data at all.',
              question: 'Asks about the project, its tasks, people or progress.',
              change: 'Asks to create, change, move, assign or plan something.',
            },
          },
        },
      }),
      signal: AbortSignal.timeout(this.plazoMs),
    });
    if (!respuesta.ok) throw new Error(`OpenRouter ${respuesta.status}`);
    const json = (await respuesta.json()) as {
      answers?: { intent?: { choice?: string; confidence?: number } };
    };
    const choice = json.answers?.intent?.choice;
    const valor: Intencion =
      choice === 'chat' ? 'charla' : choice === 'change' ? 'cambio' : 'pregunta';
    return { valor, confianza: json.answers?.intent?.confidence ?? 0 };
  }
}
