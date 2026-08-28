import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto/auth.schemas';

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessMaxAge: number;
  refreshMaxAge: number;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
}

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async login(dto: LoginDto, ctx: AuditContext): Promise<{ user: PublicUser; tokens: TokenBundle }> {
    const maxAttempts = Number(this.config.get('LOGIN_MAX_ATTEMPTS', 5));
    const lockMinutes = Number(this.config.get('LOGIN_LOCK_MINUTES', 15));

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    // Mensagem generica: nao revela se o e-mail existe.
    const invalid = new UnauthorizedException('E-mail ou senha invalidos.');

    if (!user) {
      await this.registerAttempt(dto.email, ctx, false);
      // Custo constante para dificultar enumeracao de usuarios por tempo de resposta.
      await argon2.hash(dto.password, ARGON_OPTIONS).catch(() => undefined);
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Muitas tentativas de acesso. Tente novamente em ${minutes} minuto(s).`,
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('Este usuario esta desativado.');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);

    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= maxAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + lockMinutes * 60_000) : null,
        },
      });
      await this.registerAttempt(dto.email, ctx, false);
      await this.audit.record({
        ...ctx,
        userId: user.id,
        userName: user.name,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: user.id,
        summary: `Tentativa de login sem sucesso (${attempts}/${maxAttempts})`,
      });

      if (shouldLock) {
        throw new ForbiddenException(
          `Muitas tentativas de acesso. Conta bloqueada por ${lockMinutes} minutos.`,
        );
      }
      throw invalid;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.registerAttempt(dto.email, ctx, true);
    await this.audit.record({
      ...ctx,
      userId: user.id,
      userName: user.name,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      summary: 'Login realizado com sucesso',
    });

    const tokens = await this.issueTokens(user, ctx);
    return { user: this.toPublicUser({ ...user, lastLoginAt: new Date() }), tokens };
  }

  async refresh(refreshToken?: string, ctx: AuditContext = {}): Promise<{ user: PublicUser; tokens: TokenBundle }> {
    if (!refreshToken) throw new UnauthorizedException('Sessao expirada. Faca login novamente.');

    const tokenHash = AuthService.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }
    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new ForbiddenException('Este usuario esta desativado.');
    }

    // Rotacao: o refresh usado e revogado e um novo par e emitido.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(stored.user, ctx);
    return { user: this.toPublicUser(stored.user), tokens };
  }

  async logout(refreshToken: string | undefined, ctx: AuditContext): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken
        .updateMany({
          where: { tokenHash: AuthService.hashToken(refreshToken), revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);
    }
    if (ctx.userId) {
      await this.audit.record({
        ...ctx,
        action: AuditAction.LOGOUT,
        entity: 'User',
        entityId: ctx.userId,
        summary: 'Logout realizado',
      });
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');
    return this.toPublicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, ctx: AuditContext): Promise<PublicUser> {
    const current = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!current) throw new NotFoundException('Usuario nao encontrado.');

    const emailTaken = await this.prisma.user.findFirst({
      where: { email: dto.email, id: { not: userId }, deletedAt: null },
      select: { id: true },
    });
    if (emailTaken) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { email: 'Este e-mail ja esta em uso' },
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, email: dto.email },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: userId,
      summary: `Perfil atualizado: ${updated.name}`,
      changes: AuditService.diff(current, updated),
    });

    return this.toPublicUser(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ctx: AuditContext): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!valid) {
      throw new BadRequestException({
        message: 'Dados invalidos. Revise os campos destacados.',
        errors: { currentPassword: 'Senha atual incorreta' },
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(dto.password) },
    });

    // Encerra as demais sessoes por seguranca.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      ...ctx,
      action: AuditAction.PASSWORD_CHANGE,
      entity: 'User',
      entityId: userId,
      summary: 'Senha alterada pelo proprio usuario',
    });
  }

  async forgotPassword(dto: ForgotPasswordDto, ctx: AuditContext): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null, isActive: true },
    });

    // Resposta identica exista ou nao o usuario (evita enumeracao de contas).
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: AuthService.hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const siteUrl = this.config.get<string>('PUBLIC_SITE_URL', 'http://localhost:3000').replace(/\/$/, '');
    await this.mail.sendPasswordReset(
      user.email,
      user.name,
      `${siteUrl}/admin/redefinir-senha?token=${token}`,
    );

    await this.audit.record({
      ...ctx,
      userId: user.id,
      userName: user.name,
      action: AuditAction.PASSWORD_RESET,
      entity: 'User',
      entityId: user.id,
      summary: 'Solicitacao de redefinicao de senha',
    });
  }

  async resetPassword(dto: ResetPasswordDto, ctx: AuditContext): Promise<void> {
    const record = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: AuthService.hashToken(dto.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Link de redefinicao invalido ou expirado. Solicite um novo.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await AuthService.hashPassword(dto.password),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      ...ctx,
      userId: record.userId,
      userName: record.user.name,
      action: AuditAction.PASSWORD_RESET,
      entity: 'User',
      entityId: record.userId,
      summary: 'Senha redefinida via link de recuperacao',
    });
  }

  private async issueTokens(user: User, ctx: AuditContext): Promise<TokenBundle> {
    // ConfigService pode devolver strings vindas do ambiente; garante numeros.
    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL', 900));
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL', 60 * 60 * 24 * 30));

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: AuthService.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      csrfToken: randomBytes(24).toString('hex'),
      accessMaxAge: accessTtl * 1000,
      refreshMaxAge: refreshTtl * 1000,
    };
  }

  private async registerAttempt(email: string, ctx: AuditContext, success: boolean) {
    await this.prisma.loginAttempt
      .create({ data: { email, ip: ctx.ip ?? null, success } })
      .catch(() => undefined);
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /** Remove tokens expirados/revogados; executado por tarefa agendada. */
  async purgeExpiredTokens(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    if (count > 0) this.logger.log(`${count} refresh tokens expirados removidos`);
    return count;
  }
}
