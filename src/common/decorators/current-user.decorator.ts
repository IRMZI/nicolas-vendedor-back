import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    return data && user ? user[data] : user;
  },
);
