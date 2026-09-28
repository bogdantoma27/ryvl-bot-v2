import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { GuildAdminGuard } from './guild-admin.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, GuildAdminGuard],
  exports: [AuthService, AuthGuard, GuildAdminGuard],
})
export class AuthModule {}
