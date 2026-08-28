import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

const SENSITIVE_KEYS = ['password', 'currentPassword', 'newPassword', 'token', 'authorization'];

/** Log de requisicoes sem registrar dados sensiveis. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startedAt;
        this.logger.log(
          `${request.method} ${request.originalUrl} ${response.statusCode} - ${duration}ms`,
        );
      }),
    );
  }
}

export function redactSensitive<T extends Record<string, any>>(payload: T): Record<string, any> {
  const clone: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    clone[key] = SENSITIVE_KEYS.includes(key) ? '[REDACTED]' : value;
  }
  return clone;
}
