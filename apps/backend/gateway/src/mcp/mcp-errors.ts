import { HttpException } from '@nestjs/common';

/** Un error que el MCP devuelve tal cual: estado HTTP, código y mensaje (M8). */
export class McpAccessError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
