import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_COOKIE } from '../constants';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Protege todas as rotas por padrao. O token e lido do cookie httpOnly
 * (sessao persistente do painel) ou do header Authorization.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario inativo ou removido.');
    }

    (request as any).user = user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const cookieToken = (request as any).cookies?.[ACCESS_COOKIE];
    if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    return undefined;
  }
}
