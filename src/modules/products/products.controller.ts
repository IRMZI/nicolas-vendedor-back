import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { ProductsService } from './products.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import {
  bulkActionSchema,
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
  type BulkActionDto,
  type CreateProductDto,
  type ListProductsDto,
  type UpdateProductDto,
} from './dto/product.schemas';

const statusSchema = z.object({ status: z.nativeEnum(ProductStatus) });
const featuredSchema = z.object({ isFeatured: z.boolean() });
const metricsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

@Controller('admin/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Query(zodPipe(listProductsSchema)) query: ListProductsDto) {
    return this.productsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findById(id);
  }

  @Get(':id/metrics')
  metrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodPipe(metricsQuerySchema)) query: z.infer<typeof metricsQuerySchema>,
  ) {
    return this.productsService.metrics(id, query.days);
  }

  @Post()
  create(
    @Body(zodPipe(createProductSchema)) dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.create(dto, this.ctx(req, user));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateProductSchema)) dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.update(id, dto, this.ctx(req, user));
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.duplicate(id, this.ctx(req, user));
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(statusSchema)) dto: z.infer<typeof statusSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.setStatus(id, dto.status, this.ctx(req, user));
  }

  @Patch(':id/featured')
  setFeatured(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(featuredSchema)) dto: z.infer<typeof featuredSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.setFeatured(id, dto.isFeatured, this.ctx(req, user));
  }

  @Post(':id/restore')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.restore(id, this.ctx(req, user));
  }

  @Post('bulk')
  bulk(
    @Body(zodPipe(bulkActionSchema)) dto: BulkActionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.bulk(dto, this.ctx(req, user));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.softDelete(id, this.ctx(req, user));
  }

  @Delete(':id/permanent')
  removePermanently(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.hardDelete(id, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return {
      userId: user.id,
      userName: user.name,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    };
  }
}
