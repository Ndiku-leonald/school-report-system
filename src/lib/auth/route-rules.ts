import {
  authenticatedEntryPaths,
  protectedStaffPaths,
} from "@/lib/auth/constants";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";

function pathMatches(pathname: string, paths: readonly string[]) {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function getProxyRedirect({
  isAuthenticated,
  pathname,
  search = "",
}: {
  isAuthenticated: boolean;
  pathname: string;
  search?: string;
}) {
  if (!isAuthenticated && pathMatches(pathname, protectedStaffPaths)) {
    return `/staff-login?next=${encodeURIComponent(
      sanitizeNextPath(`${pathname}${search}`),
    )}`;
  }

  if (isAuthenticated && pathMatches(pathname, authenticatedEntryPaths)) {
    return "/dashboard";
  }

  return null;
}
