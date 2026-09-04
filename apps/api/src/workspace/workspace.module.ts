import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { AdminWorkspaceController } from './admin-workspace.controller';
import { PrismaModule } from '../prisma/prisma.module';

// No longer imports AuthModule: its only use was EmailService, which now
// lives in the @Global() SharedModule and is available everywhere without
// an explicit import. This breaks the circular dependency with AuthModule
// (AuthModule -> WorkspaceModule remains, the reverse direction is gone).
@Module({
  imports: [
    PrismaModule,
  ],
  providers: [WorkspaceService],
  controllers: [WorkspaceController, AdminWorkspaceController],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
