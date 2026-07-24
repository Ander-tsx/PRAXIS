import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { Response } from 'express';

interface StandardErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

@Catch()
export class StandardExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StandardExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const rawResponse = exception.getResponse();
      const message = this.extractMessage(rawResponse, exception.message);
      const details = this.extractDetails(rawResponse, status);

      response.status(status).json(this.buildErrorPayload(this.mapStatusToCode(status), message, details));
      return;
    }

    if (exception instanceof RpcException) {
      const error = exception.getError();
      const status = this.getStatusFromError(error);
      const message = this.extractMessage(error, 'Internal server error');
      const details = this.extractDetails(error, status);
      const code = this.getRpcErrorCode(error);
      response.status(status).json(this.buildErrorPayload(code, message, details));
      return;
    }

    if (this.isErrorWithStatus(exception)) {
      const status = exception.status;
      const message = this.extractMessage(exception.response, exception.message || 'Internal server error');
      const details = this.extractDetails(exception.response, status);
      response.status(status).json(this.buildErrorPayload(this.mapStatusToCode(status), message, details));
      return;
    }

    this.logger.error('Unhandled gateway exception', exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      this.buildErrorPayload('INTERNAL_SERVER_ERROR', 'Internal server error', {}),
    );
  }

  private buildErrorPayload(code: string, message: string, details: unknown): StandardErrorPayload {
    return {
      success: false,
      error: {
        code,
        message,
        details: this.normalizeDetails(details),
      },
    };
  }

  private normalizeDetails(details: unknown): unknown {
    if (details === undefined || details === null) {
      return {};
    }

    if (typeof details === 'object') {
      if (Array.isArray(details)) {
        return details;
      }

      return details;
    }

    return { value: details };
  }

  private extractMessage(response: unknown, fallback: string): string {
    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const message = this.getMessageFromResponse(response);
      if (message) {
        return message;
      }

      const error = this.getErrorFromResponse(response);
      if (error) {
        return error;
      }
    }

    return fallback;
  }

  private extractDetails(response: unknown, status: number): unknown {
    if (response && typeof response === 'object') {
      const detailValue = this.getDetailsFromResponse(response);
      if (detailValue !== undefined) {
        return detailValue;
      }
    }

    return {};
  }

  private getMessageFromResponse(response: object): string | undefined {
    if ('message' in response) {
      const messageValue = (response as { message?: unknown }).message;
      if (Array.isArray(messageValue)) {
        return messageValue.length > 0 ? 'Validation failed' : undefined;
      }

      if (typeof messageValue === 'string') {
        return messageValue;
      }
    }

    return undefined;
  }

  private getErrorFromResponse(response: object): string | undefined {
    if ('error' in response && typeof (response as { error?: unknown }).error === 'string') {
      return (response as { error: string }).error;
    }

    return undefined;
  }

  private getDetailsFromResponse(response: object): unknown {
    if ('details' in response) {
      return (response as { details: unknown }).details;
    }

    if ('message' in response && Array.isArray((response as { message?: unknown }).message)) {
      return {
        errors: (response as { message: string[] }).message,
      };
    }

    if ('error' in response && typeof (response as { error?: unknown }).error === 'object') {
      return (response as { error: unknown }).error;
    }

    return undefined;
  }

  private getStatusFromError(error: unknown): number {
    if (error && typeof error === 'object') {
      if ('statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number') {
        return (error as { statusCode: number }).statusCode;
      }

      if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
        return (error as { status: number }).status;
      }
    }

    return HttpStatus.BAD_GATEWAY;
  }

  private getRpcErrorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      if ('statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number') {
        return this.mapStatusToCode((error as { statusCode: number }).statusCode);
      }

      if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
        return (error as { code: string }).code;
      }
    }

    return 'BAD_GATEWAY';
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      default:
        return 'HTTP_ERROR';
    }
  }

  private isErrorWithStatus(value: unknown): value is { status: number; response?: unknown; message?: string } {
    return Boolean(value && typeof value === 'object' && 'status' in value && typeof (value as { status?: unknown }).status === 'number');
  }
}
