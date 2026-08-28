import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT', 587)),
        secure: String(this.config.get('SMTP_SECURE', 'false')) === 'true',
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER'),
              pass: this.config.get<string>('SMTP_PASSWORD'),
            }
          : undefined,
      });
    }
  }

  /**
   * Envia o e-mail de recuperacao de senha. Sem SMTP configurado
   * (ambiente de desenvolvimento) o link e apenas registrado no log.
   */
  async sendPasswordReset(to: string, name: string, resetUrl: string): Promise<void> {
    const subject = 'Redefinicao de senha - Painel Nicolas Vendedor';
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6">
        <h2 style="margin:0 0 12px">Redefinicao de senha</h2>
        <p>Ola, ${escapeHtml(name)}!</p>
        <p>Recebemos um pedido para redefinir a senha do seu acesso ao painel administrativo.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Definir nova senha
          </a>
        </p>
        <p style="font-size:13px;color:#475569">
          O link expira em 1 hora. Se voce nao solicitou a alteracao, ignore este e-mail.
        </p>
      </div>`;

    if (!this.transporter) {
      this.logger.warn(
        `[DEV] SMTP nao configurado. Link de redefinicao para ${to}: ${resetUrl}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM'),
        to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar e-mail de redefinicao: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char] ?? char;
  });
}
