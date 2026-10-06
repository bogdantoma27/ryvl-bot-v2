import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { WebsiteController } from './website.controller';
import { WebsiteSubmissionsService } from './website-submissions.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [WebsiteController],
  providers: [WebsiteSubmissionsService],
})
export class WebsiteModule {}
