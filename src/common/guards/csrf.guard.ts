import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CSRF_COOKIE, CSRF_HEADER } from '../constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protecao CSRF por double-submit cookie: o backend emite um token legivel
 * no login e exige que o painel o reenvie no header a cada mutacao.
 * Requisicoes autenticadas por Bearer nao dependem de cookie e sao isentas.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (request.headers.authorization?.startsWith('Bearer ')) return true;

    const cookieToken = (request as any).cookies?.[CSRF_COOKIE];
    const headerToken = request.headers[CSRF_HEADER];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken.length !== headerToken.length ||
      !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      throw new ForbiddenException('Token de seguranca invalido. Recarregue a pagina.');
    }

    return true;
  }
}
