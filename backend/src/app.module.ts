import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LinksModule } from './links/links.module';

@Module({
  imports: [CommonModule, DatabaseModule, LinksModule],
  controllers: [HealthController],
})
export class AppModule {}
