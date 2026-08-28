import { Controller, Delete, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { TagsService } from './tags.service';
import { zodPipe } from '@/common/pipes/zod-validation.pipe';

const listSchema = z.object({ search: z.string().trim().max(60).optional() });

@Controller('admin/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(@Query(zodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.tagsService.list(query.search);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tagsService.remove(id);
  }
}
