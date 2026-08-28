import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: Number(config.get('MAX_UPLOAD_SIZE_MB', 8)) * 1024 * 1024,
          files: 12,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
})
export class UploadsModule {}
