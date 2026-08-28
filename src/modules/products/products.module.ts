import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TagsModule } from '../tags/tags.module';
import { FiltersModule } from '../filters/filters.module';

@Module({
  imports: [TagsModule, FiltersModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
