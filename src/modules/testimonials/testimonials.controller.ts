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
import { TestimonialsService } from './testimonials.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '@/common/utils/request.util';
import {
  createTestimonialSchema,
  listTestimonialsSchema,
  updateTestimonialSchema,
  type CreateTestimonialDto,
  type ListTestimonialsDto,
  type UpdateTestimonialDto,
} from './dto/testimonial.schemas';

const activeSchema = z.object({ isActive: z.boolean() });
const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })).min(1),
});

@Controller('admin/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Get()
  list(@Query(zodPipe(listTestimonialsSchema)) query: ListTestimonialsDto) {
    return this.testimonialsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.testimonialsService.findById(id);
  }

  @Post()
  create(
    @Body(zodPipe(createTestimonialSchema)) dto: CreateTestimonialDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.testimonialsService.create(dto, this.ctx(req, user));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(updateTestimonialSchema)) dto: UpdateTestimonialDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.testimonialsService.update(id, dto, this.ctx(req, user));
  }

  @Patch(':id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(activeSchema)) dto: z.infer<typeof activeSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.testimonialsService.setActive(id, dto.isActive, this.ctx(req, user));
  }

  @Post('reorder')
  reorder(
    @Body(zodPipe(reorderSchema)) dto: z.infer<typeof reorderSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.testimonialsService.reorder(dto.items, this.ctx(req, user));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.testimonialsService.remove(id, this.ctx(req, user));
  }

  private ctx(req: Request, user: AuthenticatedUser) {
    return { userId: user.id, userName: user.name, ip: getClientIp(req), userAgent: getUserAgent(req) };
  }
}
