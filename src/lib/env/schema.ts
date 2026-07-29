import { z } from "zod";

const requiredUrl = (variableName: string) =>
  z
    .string({ error: `${variableName} is required.` })
    .min(1, `${variableName} is required.`)
    .url(`${variableName} must be a valid URL.`);

const requiredSecret = (variableName: string) =>
  z
    .string({ error: `${variableName} is required.` })
    .min(1, `${variableName} is required.`);

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: requiredUrl("NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredSecret(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
  DATABASE_URL: requiredUrl("DATABASE_URL"),
  DIRECT_URL: requiredUrl("DIRECT_URL"),
});

export const administrativeEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type AdministrativeEnvironment = z.infer<
  typeof administrativeEnvironmentSchema
>;

export class EnvironmentConfigurationError extends Error {
  constructor(variableNames: string[]) {
    super(
      `Application configuration is incomplete. Check: ${variableNames.join(", ")}.`,
    );
    this.name = "EnvironmentConfigurationError";
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
) {
  const result = publicEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  return result.data;
}

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
) {
  const result = serverEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  return result.data;
}

export function parseAdministrativeEnvironment(
  environment: Record<string, string | undefined>,
) {
  const result = administrativeEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      getInvalidVariableNames(result.error),
    );
  }

  return result.data;
}
