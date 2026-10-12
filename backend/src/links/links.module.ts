import { Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { RedirectController } from './redirect.controller';
import { LinksRepository } from './links.repository';
import { LinksService } from './links.service';

@Module({
  controllers: [LinksController, RedirectController],
  providers: [LinksService, LinksRepository],
})
export class LinksModule {}
