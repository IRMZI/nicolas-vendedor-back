import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Converte qualquer erro em uma resposta JSON consistente,
 * sem vazar stack traces ou detalhes internos para o cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor.';
    let errors: Record<string, string> | undefined;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const payload = body as Record<string, any>;
        message = payload.message ?? exception.message;
        errors = payload.errors;
        code = payload.code;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[] | undefined)?.join(', ');
          message = target
            ? `Ja existe um registro com este valor em: ${target}.`
            : 'Registro duplicado.';
          code = 'UNIQUE_VIOLATION';
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro nao encontrado.';
          code = 'NOT_FOUND';
          break;
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message = 'Existem registros vinculados que impedem esta operacao.';
          code = 'FOREIGN_KEY';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Nao foi possivel completar a operacao no banco de dados.';
          code = exception.code;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} -> ${status}: ${message}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
