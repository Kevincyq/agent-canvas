export type PortalUserContext = {
  userId: string;
  tenantId: string;
  source: "header" | "body" | "default";
};

const DEFAULT_USER_ID = "local-user";
const DEFAULT_TENANT_ID = "local-tenant";

/**
 * Portal PoC placeholder: trust same-origin / gateway-injected headers.
 * Production Portal must authenticate upstream and overwrite these values.
 */
export function resolvePortalUserContext(input: {
  headers: Headers;
  bodyUserId?: string | null;
  bodyTenantId?: string | null;
}): PortalUserContext {
  const headerUserId =
    input.headers.get("x-portal-user-id")?.trim() ||
    input.headers.get("x-user-id")?.trim() ||
    "";
  const headerTenantId =
    input.headers.get("x-portal-tenant-id")?.trim() ||
    input.headers.get("x-tenant-id")?.trim() ||
    "";

  if (headerUserId) {
    return {
      userId: headerUserId.slice(0, 100),
      tenantId: (headerTenantId || DEFAULT_TENANT_ID).slice(0, 100),
      source: "header",
    };
  }

  if (input.bodyUserId?.trim()) {
    return {
      userId: input.bodyUserId.trim().slice(0, 100),
      tenantId: (input.bodyTenantId?.trim() || DEFAULT_TENANT_ID).slice(0, 100),
      source: "body",
    };
  }

  return {
    userId: DEFAULT_USER_ID,
    tenantId: DEFAULT_TENANT_ID,
    source: "default",
  };
}
