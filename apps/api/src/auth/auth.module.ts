import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { RolesGuard } from './roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspace/workspace.module';

// No forwardRef needed: EmailService (WorkspaceModule's only reason to import
// AuthModule) now lives in the @Global() SharedModule instead, so the
// dependency is one-directional — AuthModule -> WorkspaceModule only.
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret:
        process.env.JWT_SECRET ||
        (process.env.NODE_ENV === 'production'
          ? (() => {
              throw new Error('JWT_SECRET must be defined in production!');
            })()
          : 'dev-jwt-secret-only'),
      signOptions: { expiresIn: '15m' }, // short-lived access tokens
    }),
    PrismaModule,
    WorkspaceModule,
  ],
  providers: [AuthService, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
