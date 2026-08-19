import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

/**
 * Una fila de la cartera: un proyecto, con lo justo para saber si arde.
 *
 * ## Qué lleva y qué no
 *
 * No es un resumen del proyecto —para eso está su pantalla— sino **las señales
 * que hacen entrar en él**. Todo lo que hay aquí responde a «¿tengo que mirar
 * este hoy?»: lo vencido, lo parado, lo que nadie ha cogido y si el ritmo ha
 * caído. Lo que no responde a esa pregunta se queda fuera aunque sea barato de
 * calcular, porque una tabla de quince columnas no se lee de un vistazo y esta
 * vista existe para leerse de un vistazo.
 *
 * ⚠️ **`vencidas` y `paradas` no se suman en un contador único.** Son un problema
 * y una advertencia, y ya está escrito como invariante 3 del plan: una tarea
 * vencida incumple una fecha que alguien puso; una parada solo lleva tiempo sin
 * moverse, y puede ser correcto. Un número que las junte no se puede interpretar.
 */
export interface ReportPortfolioRow {
  projectId: string;
  /** Nombre y slug los pone el gateway: reports-service no conoce los proyectos. */
  name?: string;
  slug?: string;
  total: number;
  abiertas: number;
  cerradas: number;
  /** Abiertas con la fecha límite pasada. Una entregada no vence. */
  vencidas: number;
  /** Abiertas sin nadie asignado. */
  sinAsignar: number;
  /**
   * Abiertas que llevan `dias` sin cambiar de columna.
   *
   * ⚠️ Aquí **no** se distingue la que no tiene historial de la que sí, al
   * contrario que en el informe de un proyecto. En una tabla de una línea por
   * proyecto no cabe el matiz, y un asterisco por fila no lo explica: quien
   * quiera saber cuáles son entra al proyecto, que es exactamente lo que esta
   * vista intenta que haga.
   */
  paradas: number;
  cerradasSemana: number;
  cerradasSemanaAnterior: number;
}

/** Qué acota la cartera. Poco, a propósito. */
export class ReportPortfolioQueryDto {
  /**
   * Umbral de parón, en días. Por defecto 7, como en el informe de un proyecto.
   *
   * ⚠️ **Es el único parámetro, y los filtros de `ReportFiltersQueryDto` no
   * están.** No es un olvido: `boardId`, `assigneeId` y `labelId` son ids de
   * **un** proyecto —una etiqueta pertenece a uno solo— así que cruzarlos con
   * una lista de proyectos no significa nada. `priority` y el tramo sí valdrían,
   * pero esta vista es para decidir dónde entrar, y filtrarla por prioridad es
   * ya la pregunta de dentro.
   */
  @ApiPropertyOptional({ description: 'Días sin moverse para contar como parada (1–365)' })
  @IsOptional()
  dias?: string;
}
