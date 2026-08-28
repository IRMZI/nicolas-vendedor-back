import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService, type AuditContext } from '../audit/audit.service';
import { sanitizeHtml } from '@/common/utils/sanitize.util';
import type { UpdateSettingsDto } from './dto/settings.schemas';

const SETTINGS_ID = 'singleton';

/** Scripts de terceiros permitidos (Analytics/Pixel) sao aplicados via campos dedicados. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Sempre existe um registro de configuracao; e criado sob demanda. */
  async get() {
    const existing = await this.prisma.setting.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return this.prisma.setting.create({ data: { id: SETTINGS_ID } });
  }

  async update(dto: UpdateSettingsDto, ctx: AuditContext) {
    const current = await this.get();

    const data: Prisma.SettingUpdateInput = {
      ...dto,
      email: dto.email || null,
      aboutContent: sanitizeHtml(dto.aboutContent),
      privacyPolicy: sanitizeHtml(dto.privacyPolicy),
      termsOfUse: sanitizeHtml(dto.termsOfUse),
      socialLinks: (dto.socialLinks ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      benefits: (dto.benefits ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    };

    const settings = await this.prisma.setting.update({ where: { id: SETTINGS_ID }, data });

    await this.audit.record({
      ...ctx,
      action: AuditAction.SETTINGS_UPDATE,
      entity: 'Setting',
      entityId: SETTINGS_ID,
      summary: 'Configuracoes gerais atualizadas',
      changes: AuditService.diff(current, settings),
    });

    return settings;
  }

  /**
   * Versao publica: nunca expoe campos administrativos ou scripts brutos
   * alem dos identificadores necessarios ao site.
   */
  async publicSettings() {
    const settings = await this.get();
    const {
      customScripts,
      privacyPolicy,
      termsOfUse,
      updatedAt: _updatedAt,
      ...rest
    } = settings;

    return {
      ...rest,
      hasPrivacyPolicy: !!privacyPolicy,
      hasTermsOfUse: !!termsOfUse,
      customScripts: customScripts ?? null,
    };
  }

  async legalPages() {
    const settings = await this.get();
    return {
      privacyPolicy: settings.privacyPolicy,
      termsOfUse: settings.termsOfUse,
      siteName: settings.siteName,
      updatedAt: settings.updatedAt,
    };
  }

  /** Monta a mensagem do WhatsApp a partir do modelo configurado. */
  buildWhatsappMessage(template: string, productName: string, productUrl: string): string {
    return template.replace(/\{produto\}/g, productName).replace(/\{link\}/g, productUrl);
  }
}
