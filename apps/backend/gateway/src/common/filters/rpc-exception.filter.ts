import { Catch, ExceptionFilter, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Response } from 'express';

@Catch(RpcException)
export class RpcExceptionFilter implements ExceptionFilter {
    catch(exception: RpcException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const message = exception.getError();

        const statusMap: Record<string, number> = {
            'Invalid credentials':    HttpStatus.UNAUTHORIZED,
            'Email already registered': HttpStatus.CONFLICT,
            'Invalid or expired token': HttpStatus.UNAUTHORIZED,
            'Not Found': HttpStatus.NOT_FOUND,
        };

        const status = typeof message === 'string'
            ? (statusMap[message] ?? HttpStatus.BAD_REQUEST)
            : HttpStatus.INTERNAL_SERVER_ERROR;
        
        response.status(status).json({
            statusCode: status,
            message,
        });
    }
}