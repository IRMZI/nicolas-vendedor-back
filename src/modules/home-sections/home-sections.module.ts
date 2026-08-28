import { Module } from '@nestjs/common';
import { HomeSectionsService } from './home-sections.service';
import { HomeSectionsController } from './home-sections.controller';

@Module({
  controllers: [HomeSectionsController],
  providers: [HomeSectionsService],
  exports: [HomeSectionsService],
})
export class HomeSectionsModule {}
