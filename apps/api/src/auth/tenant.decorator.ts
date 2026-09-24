import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extracts the authenticated tenant from the request (set by ApiKeyGuard) */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);

/** Extracts the authenticated tenant ID from the request */
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);
