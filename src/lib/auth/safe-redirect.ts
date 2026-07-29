const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

export function sanitizeNextPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_PATH,
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://local.invalid");

    if (parsed.origin !== "https://local.invalid") {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
