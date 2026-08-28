import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { StorageService, type ImageVariant } from '../storage/storage.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';

const uploadQuerySchema = z.object({
  folder: z.string().trim().max(40).default('produtos'),
  variant: z.enum(['product', 'banner', 'thumb', 'logo', 'avatar']).default('product'),
});

const removeSchema = z.object({ storageKey: z.string().trim().min(1) });

@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query(zodPipe(uploadQuerySchema)) query: z.infer<typeof uploadQuerySchema>,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.storage.storeImage(file, query.folder, query.variant as ImageVariant);
  }

  @Post('batch')
  @UseInterceptors(FilesInterceptor('files', 12))
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Query(zodPipe(uploadQuerySchema)) query: z.infer<typeof uploadQuerySchema>,
  ) {
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.');
    return Promise.all(
      files.map((file) => this.storage.storeImage(file, query.folder, query.variant as ImageVariant)),
    );
  }

  @Delete()
  async remove(@Query(zodPipe(removeSchema)) query: z.infer<typeof removeSchema>) {
    await this.storage.remove(query.storageKey);
    return { success: true };
  }
}
