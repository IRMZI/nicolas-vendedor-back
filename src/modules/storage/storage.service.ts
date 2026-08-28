import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { ALLOWED_IMAGE_MIME } from '@/common/constants';

export interface StoredFile {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

/** Assinaturas (magic bytes) para validar o conteudo real do arquivo. */
const MAGIC_SIGNATURES: Array<{ mime: string; test: (buf: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'image/avif', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
];

export type ImageVariant = 'product' | 'banner' | 'thumb' | 'logo' | 'avatar';

const VARIANT_SIZES: Record<ImageVariant, { width: number; height?: number; quality: number }> = {
  product: { width: 1600, quality: 82 },
  banner: { width: 2000, quality: 80 },
  thumb: { width: 600, quality: 80 },
  logo: { width: 512, quality: 90 },
  avatar: { width: 256, quality: 85 },
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly uploadDir: string;
  private readonly maxBytes: number;
  private readonly publicApiUrl: string;
  private s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<'local' | 's3'>('STORAGE_DRIVER', 'local');
    this.uploadDir = resolve(this.config.get<string>('UPLOAD_DIR', './uploads'));
    this.maxBytes = Number(this.config.get('MAX_UPLOAD_SIZE_MB', 8)) * 1024 * 1024;
    this.publicApiUrl = this.config.get<string>('PUBLIC_API_URL', 'http://localhost:4000').replace(/\/$/, '');

    if (this.driver === 's3') {
      const endpoint = this.config.get<string>('S3_ENDPOINT');
      this.s3 = new S3Client({
        region: this.config.get<string>('S3_REGION', 'auto'),
        ...(endpoint ? { endpoint } : {}),
        forcePathStyle: String(this.config.get('S3_FORCE_PATH_STYLE', 'true')) !== 'false',
        credentials: {
          accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID', ''),
          secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY', ''),
        },
      });
    }
  }

  /**
   * Valida, otimiza (redimensiona + converte para WebP) e persiste a imagem.
   * A validacao usa magic bytes, nao apenas a extensao/mimetype declarados.
   */
  async storeImage(
    file: Express.Multer.File,
    folder = 'produtos',
    variant: ImageVariant = 'product',
  ): Promise<StoredFile> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo vazio ou invalido.');
    }
    if (file.size > this.maxBytes) {
      throw new BadRequestException(
        `Imagem muito grande. O limite e de ${Math.round(this.maxBytes / 1024 / 1024)}MB.`,
      );
    }
    if (!ALLOWED_IMAGE_MIME.includes(file.mimetype as any)) {
      throw new BadRequestException('Formato nao suportado. Envie JPG, PNG, WebP, AVIF ou GIF.');
    }

    const detected = MAGIC_SIGNATURES.find((sig) => sig.test(file.buffer));
    if (!detected) {
      throw new BadRequestException('O conteudo do arquivo nao corresponde a uma imagem valida.');
    }

    const preset = VARIANT_SIZES[variant];
    let output: Buffer;
    let width = 0;
    let height = 0;

    try {
      const pipeline = sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: preset.width, withoutEnlargement: true })
        .webp({ quality: preset.quality });

      const result = await pipeline.toBuffer({ resolveWithObject: true });
      output = result.data;
      width = result.info.width;
      height = result.info.height;
    } catch {
      throw new BadRequestException('Nao foi possivel processar a imagem enviada.');
    }

    const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'geral';
    const key = `${safeFolder}/${new Date().getFullYear()}/${randomUUID()}.webp`;

    const url =
      this.driver === 's3' ? await this.putToS3(key, output) : await this.putToDisk(key, output);

    return {
      url,
      storageKey: key,
      width,
      height,
      sizeBytes: output.length,
      mimeType: 'image/webp',
    };
  }

  async remove(storageKey?: string | null): Promise<void> {
    if (!storageKey) return;
    try {
      if (this.driver === 's3' && this.s3) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.config.get<string>('S3_BUCKET', ''),
            Key: storageKey,
          }),
        );
      } else {
        await unlink(join(this.uploadDir, storageKey));
      }
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel remover o arquivo ${storageKey}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  private async putToDisk(key: string, data: Buffer): Promise<string> {
    const target = join(this.uploadDir, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return `${this.publicApiUrl}/uploads/${key}`;
  }

  private async putToS3(key: string, data: Buffer): Promise<string> {
    if (!this.s3) throw new BadRequestException('Armazenamento S3 nao configurado.');
    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) throw new BadRequestException('S3_BUCKET nao configurado.');

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const base = this.config.get<string>('S3_PUBLIC_URL');
    if (base) return `${base.replace(/\/$/, '')}/${key}`;

    const endpoint = this.config.get<string>('S3_ENDPOINT');
    return endpoint ? `${endpoint.replace(/\/$/, '')}/${bucket}/${key}` : key;
  }
}
