/**
 * Sobre de respuesta estándar del gateway de PRAXIS.
 *
 * Todo endpoint responde envuelto por StandardResponseInterceptor (éxito) o
 * StandardExceptionFilter (error). Ver docs/frontend/CONTRATO-API.md
 */

export interface ApiEnvelopeSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'INTERNAL_SERVER_ERROR'
  | 'BAD_GATEWAY'
  | 'HTTP_ERROR'
  /**
   * Código de dominio explícito, no derivado del status. Un 403 de
   * suspensión y un 403 de permiso normal se distinguen por esto —
   * `PROJECT_SUSPENDED_CODE` en `domain.ts` — y no por el mensaje.
   */
  | 'PROJECT_SUSPENDED';

export interface ApiEnvelopeError {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiEnvelope<T> = ApiEnvelopeSuccess<T> | ApiEnvelopeError;

/** Respuesta de listados paginados: `{ items, total }` */
export interface Paginated<T> {
  items: T[];
  total: number;
}

/**
 * Error de negocio devuelto por el gateway.
 * Conserva el status HTTP y el código del sobre para que quien llama pueda
 * decidir sin volver a parsear nada.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * Mensajes de validación de class-validator.
   * El gateway los deja en `details.errors` y pone "Validation failed" en `message`.
   */
  get validationErrors(): string[] {
    const details = this.details;
    if (details && typeof details === 'object' && 'errors' in details) {
      const errors = (details as { errors: unknown }).errors;
      if (Array.isArray(errors)) {
        return errors.filter((e): e is string => typeof e === 'string');
      }
    }
    return [];
  }
}

function isEnvelope(payload: unknown): payload is ApiEnvelope<unknown> {
  return Boolean(payload && typeof payload === 'object' && 'success' in payload);
}

/**
 * Desenvuelve una respuesta del gateway y devuelve el `data` tipado.
 *
 * Lanza ApiError si el gateway respondió error, si el cuerpo no es JSON, o si
 * no viene envuelto (síntoma de estar hablando con algo que no es el gateway).
 */
export async function unwrapEnvelope<T>(response: Response): Promise<T> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      response.ok ? 'BAD_GATEWAY' : 'HTTP_ERROR',
      'El servidor devolvió una respuesta que no es JSON.',
    );
  }

  if (!isEnvelope(payload)) {
    throw new ApiError(
      response.status,
      'BAD_GATEWAY',
      'El servidor devolvió una respuesta con un formato inesperado.',
      payload,
    );
  }

  if (payload.success === false) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'HTTP_ERROR',
      payload.error?.message ?? 'Error desconocido del servidor.',
      payload.error?.details,
    );
  }

  return payload.data as T;
}
