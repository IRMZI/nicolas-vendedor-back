import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase()),
  );

const numeric = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: numeric(4000),
  API_PREFIX: z.string().default('api'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  PUBLIC_SITE_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatorio'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET precisa ter ao menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa ter ao menos 16 caracteres'),
  JWT_ACCESS_TTL: numeric(900),
  JWT_REFRESH_TTL: numeric(60 * 60 * 24 * 30),

  SESSION_COOKIE_DOMAIN: optionalString,
  SESSION_COOKIE_SECURE: booleanish.default(false),
  SESSION_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  LOGIN_MAX_ATTEMPTS: numeric(5),
  LOGIN_LOCK_MINUTES: numeric(15),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: numeric(8),

  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_URL: optionalString,
  S3_FORCE_PATH_STYLE: booleanish.default(true),

  ANALYTICS_DEDUPE_MINUTES: numeric(30),

  SMTP_HOST: optionalString,
  SMTP_PORT: numeric(587),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().default('Nicolas Vendedor <nao-responda@localhost>'),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig extends Env {
  corsOrigins: string[];
  isProduction: boolean;
}

export function loadConfiguration(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variaveis de ambiente invalidas:\n${issues}`);
  }

  const env = parsed.data;

  return {
    ...env,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    isProduction: env.NODE_ENV === 'production',
  };
}
