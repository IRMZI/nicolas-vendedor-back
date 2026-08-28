import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type TokenBundle } from './auth.service';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '@/common/constants';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import type { AuditContext } from '../audit/audit.service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
  type ChangePasswordDto,
  type ForgotPasswordDto,
  type LoginDto,
  type ResetPasswordDto,
  type UpdateProfileDto,
} from './dto/auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(zodPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(dto, this.context(req));
    this.setAuthCookies(res, tokens);
    return { user, csrfToken: tokens.csrfToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { user, tokens } = await this.authService.refresh(token, this.context(req));
    this.setAuthCookies(res, tokens);
    return { user, csrfToken: tokens.csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE], {
      ...this.context(req),
      userId: user.id,
      userName: user.name,
    });
    this.clearAuthCookies(res);
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @Patch('profile')
  updateProfile(
    @Body(zodPipe(updateProfileSchema)) dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.authService.updateProfile(user.id, dto, {
      ...this.context(req),
      userId: user.id,
      userName: user.name,
    });
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body(zodPipe(changePasswordSchema)) dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.changePassword(user.id, dto, {
      ...this.context(req),
      userId: user.id,
      userName: user.name,
    });
    this.clearAuthCookies(res);
    return { success: true, message: 'Senha alterada. Entre novamente com a nova senha.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(zodPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
    @Req() req: Request,
  ) {
    await this.authService.forgotPassword(dto, this.context(req));
    return {
      success: true,
      message: 'Se o e-mail estiver cadastrado, enviaremos as instrucoes de redefinicao.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(zodPipe(resetPasswordSchema)) dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    await this.authService.resetPassword(dto, this.context(req));
    return { success: true, message: 'Senha redefinida com sucesso. Faca login novamente.' };
  }

  private context(req: Request): AuditContext {
    return { ip: getClientIp(req), userAgent: getUserAgent(req) };
  }

  private cookieOptions(maxAge: number, httpOnly = true) {
    return {
      httpOnly,
      secure: String(this.config.get('SESSION_COOKIE_SECURE', 'false')) === 'true',
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('SESSION_COOKIE_SAMESITE', 'lax'),
      domain: this.config.get<string>('SESSION_COOKIE_DOMAIN') || undefined,
      path: '/',
      maxAge,
    } as const;
  }

  private setAuthCookies(res: Response, tokens: TokenBundle) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, this.cookieOptions(tokens.accessMaxAge));
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, this.cookieOptions(tokens.refreshMaxAge));
    // Legivel pelo front para o double-submit de CSRF.
    res.cookie(CSRF_COOKIE, tokens.csrfToken, this.cookieOptions(tokens.refreshMaxAge, false));
  }

  private clearAuthCookies(res: Response) {
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
      res.clearCookie(name, {
        path: '/',
        domain: this.config.get<string>('SESSION_COOKIE_DOMAIN') || undefined,
        secure: String(this.config.get('SESSION_COOKIE_SECURE', 'false')) === 'true',
        sameSite: this.config.get<'lax' | 'strict' | 'none'>('SESSION_COOKIE_SAMESITE', 'lax'),
      });
    }
  }
}
