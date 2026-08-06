import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ErrorPayload {
  statusCode: number;
  message: string;
  error?: unknown;
  details?: unknown;
}

interface StandardEnvelope {
  success: boolean;
  data?: unknown;
  meta?: unknown;
  error?: unknown;
}

@Injectable()
export class StandardResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((response) => this.normalizeResponse(response)));
  }

  private normalizeResponse(response: unknown): unknown {
    if (response === undefined || response === null) {
      return { success: true, data: null, meta: {} };
    }

    if (this.isStandardEnvelope(response)) {
      return response;
    }

    if (this.isErrorPayload(response)) {
      throw new HttpException(response.message, response.statusCode);
    }

    return {
      success: true,
      data: response,
      meta: {},
    };
  }

  private isStandardEnvelope(payload: unknown): payload is StandardEnvelope {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return 'success' in payload && ('data' in payload || 'error' in payload || 'meta' in payload);
  }

  private isErrorPayload(payload: unknown): payload is ErrorPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return (
      'statusCode' in payload &&
      'message' in payload &&
      typeof (payload as ErrorPayload).statusCode === 'number'
    );
  }
}
