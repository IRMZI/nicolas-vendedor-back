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
import type { Request } from 'express';
import { z } from 'zod';
import { CategoriesService } from './categories.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import {
  createCategorySchema,
  deleteCategorySchema,
  linkProductsSchema,
  listCategoriesSchema,
  reorderSchema,
  updateCategorySchema,
  type CreateCategoryDto,
  type DeleteCategoryDto,
  type LinkProductsDto,
  type ListCategoriesDto,
  type ReorderDto,
  type UpdateCategoryDto,
} from './dto/category.schemas';

const activeSchema = z.object({ isActive: z.boolean() });

@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list(@Query(zodPipe(listCategoriesSchema)) query: ListCategoriesDto) {
    return this.categoriesService.list(query);
  }

  @Get('tree')
  tree() {
    return this.categoriesService.tree();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findById(id);
  }

  @Get(':id/products')
  products(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.products(id);
  }

  @Get(':id/delete-impact')
  deleteImpact(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.deleteImpact(id);
  }

  @Post()
  create(
    @Body(zodPipe(createCategorySchema)) dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.create(dto, this.ctx(req, user));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateCategorySchema)) dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.update(id, dto, this.ctx(req, user));
  }

  @Post('reorder')
  reorder(
    @Body(zodPipe(reorderSchema)) dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.reorder(dto, this.ctx(req, user));
  }

  @Patch(':id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(activeSchema)) dto: z.infer<typeof activeSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.setActive(id, dto.isActive, this.ctx(req, user));
  }

  @Post(':id/products')
  linkProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(linkProductsSchema)) dto: LinkProductsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.linkProducts(id, dto, this.ctx(req, user));
  }

  @Delete(':id/products/:productId')
  unlinkProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.unlinkProduct(id, productId, this.ctx(req, user));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodPipe(deleteCategorySchema)) query: DeleteCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.categoriesService.remove(id, query, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return { userId: user.id, userName: user.name, ip: getClientIp(req), userAgent: getUserAgent(req) };
  }
}
