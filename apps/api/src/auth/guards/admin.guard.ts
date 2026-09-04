import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const secret = process.env.ADMIN_SECRET;
        const provided = request.headers['x-admin-secret'];

        if (!secret) {
            throw new ForbiddenException('Admin access is not configured on this server');
        }
        if (!provided || provided !== secret) {
            throw new ForbiddenException('Invalid admin credentials');
        }
        return true;
    }
}
