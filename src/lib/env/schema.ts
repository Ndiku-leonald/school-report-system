import { z } from "zod";

export type EnvironmentMode = "development" | "test" | "production";

export interface EnvironmentParseOptions {
  mode?: EnvironmentMode;
}

const requiredUrl = (variableName: string) =>
  z
    .string({ error: `${variableName} is required.` })
    .min(1, `${variableName} is required.`)
    .url(`${variableName} must be a valid URL.`);

const requiredSecret = (variableName: string) =>
  z
    .string({ error: `${variableName} is required.` })
    .min(1, `${variableName} is required.`)
    .refine(
      (value) => value.trim().length > 0,
      `${variableName} must not be empty.`,
    );

const authenticationFlowSecret = requiredSecret(
  "AUTH_FLOW_SIGNING_SECRET",
).refine(
  (value) => Buffer.byteLength(value, "utf8") >= 32,
  "AUTH_FLOW_SIGNING_SECRET must contain at least 32 bytes.",
);

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: requiredUrl("NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredSecret(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
});

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: requiredUrl("DATABASE_URL"),
  DIRECT_URL: requiredUrl("DIRECT_URL"),
});

export const administrativeEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
});

export const authenticationFlowEnvironmentSchema = z.object({
  AUTH_FLOW_SIGNING_SECRET: authenticationFlowSecret,
});

const parentAccessRateLimitSecret = requiredSecret(
  "PARENT_ACCESS_RATE_LIMIT_SECRET",
).refine(
  (value) => Buffer.byteLength(value, "utf8") >= 32,
  "PARENT_ACCESS_RATE_LIMIT_SECRET must contain at least 32 bytes.",
);

export const parentPortalEnvironmentSchema =
  administrativeEnvironmentSchema.extend({
    PARENT_ACCESS_RATE_LIMIT_SECRET: parentAccessRateLimitSecret,
  });

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type AdministrativeEnvironment = z.infer<
  typeof administrativeEnvironmentSchema
>;
export type AuthenticationFlowEnvironment = z.infer<
  typeof authenticationFlowEnvironmentSchema
>;
export type ParentPortalEnvironment = z.infer<
  typeof parentPortalEnvironmentSchema
>;

export class EnvironmentConfigurationError extends Error {
  constructor(variableNames: string[]) {
    super(
      `Application configuration is incomplete. Check: ${variableNames.join(", ")}.`,
    );
    this.name = "EnvironmentConfigurationError";
  }
}

const PLACEHOLDER_SECRET_VALUES = new Set([
  "change-me",
  "changeme",
  "secret",
  "development-secret",
  "test-secret",
  "example",
  "placeholder",
]);

function getEnvironmentMode(
  environment: Record<string, string | undefined>,
  options?: EnvironmentParseOptions,
): EnvironmentMode {
  const mode = options?.mode ?? environment.NODE_ENV ?? process.env.NODE_ENV;

  return mode === "production" || mode === "test" ? mode : "development";
}

function isPlaceholderSecret(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    PLACEHOLDER_SECRET_VALUES.has(normalized) ||
    /^(synthetic|test|dev|development|example|placeholder)[-_]/i.test(
      normalized,
    )
  );
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function normalizeApplicationUrl(value: string, mode: EnvironmentMode) {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EnvironmentConfigurationError(["NEXT_PUBLIC_APP_URL"]);
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname.endsWith("/"))
  ) {
    throw new EnvironmentConfigurationError(["NEXT_PUBLIC_APP_URL"]);
  }

  if (mode === "production" && url.protocol !== "https:") {
    throw new EnvironmentConfigurationError(["NEXT_PUBLIC_APP_URL"]);
  }

  if (
    mode !== "production" &&
    url.protocol === "http:" &&
    !isLoopbackHost(url.hostname)
  ) {
    throw new EnvironmentConfigurationError(["NEXT_PUBLIC_APP_URL"]);
  }

  return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`;
}

function validateSupabaseUrl(value: string, mode: EnvironmentMode) {
  const url = new URL(value);

  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      mode !== "production" &&
      isLoopbackHost(url.hostname)
    )
  ) {
    throw new EnvironmentConfigurationError(["NEXT_PUBLIC_SUPABASE_URL"]);
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new EnvironmentConfigurationError(["NEXT_PUBLIC_SUPABASE_URL"]);
  }
}

function validateSecretQuality(
  environment: Record<string, string | undefined>,
  mode: EnvironmentMode,
  variableNames: string[],
) {
  if (mode !== "production") return;

  const invalidNames = variableNames.filter((variableName) => {
    const value = environment[variableName];
    return typeof value === "string" && isPlaceholderSecret(value);
  });

  if (invalidNames.length > 0) {
    throw new EnvironmentConfigurationError(invalidNames);
  }
}

function validateSecretSeparation(
  environment: Record<string, string | undefined>,
) {
  const invalidNames: string[] = [];
  const publicAnonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  if (publicAnonKey && serviceRoleKey && publicAnonKey === serviceRoleKey) {
    invalidNames.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (
    environment.AUTH_FLOW_SIGNING_SECRET &&
    (environment.AUTH_FLOW_SIGNING_SECRET === publicAnonKey ||
      environment.AUTH_FLOW_SIGNING_SECRET === serviceRoleKey)
  ) {
    invalidNames.push("AUTH_FLOW_SIGNING_SECRET");
  }

  if (
    environment.PARENT_ACCESS_RATE_LIMIT_SECRET &&
    (environment.PARENT_ACCESS_RATE_LIMIT_SECRET === publicAnonKey ||
      environment.PARENT_ACCESS_RATE_LIMIT_SECRET === serviceRoleKey)
  ) {
    invalidNames.push("PARENT_ACCESS_RATE_LIMIT_SECRET");
  }

  if (
    environment.AUTH_FLOW_SIGNING_SECRET &&
    environment.PARENT_ACCESS_RATE_LIMIT_SECRET &&
    environment.AUTH_FLOW_SIGNING_SECRET ===
      environment.PARENT_ACCESS_RATE_LIMIT_SECRET
  ) {
    invalidNames.push(
      "AUTH_FLOW_SIGNING_SECRET",
      "PARENT_ACCESS_RATE_LIMIT_SECRET",
    );
  }

  if (invalidNames.length > 0) {
    throw new EnvironmentConfigurationError([...new Set(invalidNames)]);
  }
}

export function assertNoPrivilegedPublicEnvironmentVariables(
  environment: Record<string, string | undefined>,
) {
  const suspiciousNames = Object.keys(environment).filter(
    (variableName) =>
      /^NEXT_PUBLIC_/i.test(variableName) &&
      /(SECRET|TOKEN|PASSWORD|HMAC|SIGNING|SERVICE_ROLE|DATABASE|DIRECT|PRIVATE|CREDENTIAL)/i.test(
        variableName,
      ),
  );

  if (suspiciousNames.length > 0) {
    throw new EnvironmentConfigurationError(suspiciousNames);
  }
}

function getInvalidVariableNames(error: z.ZodError) {
  return [
    ...new Set(
      error.issues
        .map((issue) => issue.path[0])
        .filter((path): path is string => typeof path === "string"),
    ),
  ];
}

export function parsePublicEnvironment(
  environment: Record<string, string | undefined>,
  options?: EnvironmentParseOptions,
) {
  assertNoPrivilegedPublicEnvironmentVariables(environment);
  const result = publicEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  const mode = getEnvironmentMode(environment, options);
  validateSupabaseUrl(result.data.NEXT_PUBLIC_SUPABASE_URL, mode);

  return {
    ...result.data,
    NEXT_PUBLIC_APP_URL: normalizeApplicationUrl(
      result.data.NEXT_PUBLIC_APP_URL,
      mode,
    ),
  };
}

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
  options?: EnvironmentParseOptions,
) {
  const result = serverEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  const mode = getEnvironmentMode(environment, options);
  validateSecretQuality(environment, mode, ["SUPABASE_SERVICE_ROLE_KEY"]);
  validateSecretSeparation(environment);
  validateSupabaseUrl(result.data.NEXT_PUBLIC_SUPABASE_URL, mode);

  return {
    ...result.data,
    NEXT_PUBLIC_APP_URL: normalizeApplicationUrl(
      result.data.NEXT_PUBLIC_APP_URL,
      mode,
    ),
  };
}

export function parseAdministrativeEnvironment(
  environment: Record<string, string | undefined>,
  options?: EnvironmentParseOptions,
) {
  const result = administrativeEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  const mode = getEnvironmentMode(environment, options);
  validateSecretQuality(environment, mode, ["SUPABASE_SERVICE_ROLE_KEY"]);
  validateSecretSeparation(environment);
  validateSupabaseUrl(result.data.NEXT_PUBLIC_SUPABASE_URL, mode);

  return {
    ...result.data,
    NEXT_PUBLIC_APP_URL: normalizeApplicationUrl(
      result.data.NEXT_PUBLIC_APP_URL,
      mode,
    ),
  };
}

export function parseAuthenticationFlowEnvironment(
  environment: Record<string, string | undefined>,
  options?: EnvironmentParseOptions,
) {
  const result = authenticationFlowEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  const mode = getEnvironmentMode(environment, options);
  validateSecretQuality(environment, mode, ["AUTH_FLOW_SIGNING_SECRET"]);
  validateSecretSeparation(environment);

  return result.data;
}

export function parseParentPortalEnvironment(
  environment: Record<string, string | undefined>,
  options?: EnvironmentParseOptions,
) {
  const result = parentPortalEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  const mode = getEnvironmentMode(environment, options);
  validateSecretQuality(environment, mode, [
    "SUPABASE_SERVICE_ROLE_KEY",
    "PARENT_ACCESS_RATE_LIMIT_SECRET",
  ]);
  validateSecretSeparation(environment);
  validateSupabaseUrl(result.data.NEXT_PUBLIC_SUPABASE_URL, mode);

  return {
    ...result.data,
    NEXT_PUBLIC_APP_URL: normalizeApplicationUrl(
      result.data.NEXT_PUBLIC_APP_URL,
      mode,
    ),
  };
}

export function parseDatabaseEnvironment(
  environment: Record<string, string | undefined>,
) {
  const result = databaseEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  return result.data;
}
