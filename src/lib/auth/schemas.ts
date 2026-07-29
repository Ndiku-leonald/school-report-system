import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128, "Use no more than 128 characters."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const selectSchoolSchema = z.object({
  membershipId: z.string().uuid("Select a valid school."),
  next: z.string().optional(),
});

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialAuthActionState: AuthActionState = { status: "idle" };
