import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .transform((value) => value || null);

const requiredName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(100, "Keep names to 100 characters or fewer.");

const optionalDate = z
  .union([z.literal(""), z.iso.date(), z.null()])
  .transform((value) => value || null);

export const admissionSchema = z
  .object({
    admissionNumber: z
      .string()
      .trim()
      .min(1, "Enter an admission number.")
      .max(100),
    firstName: requiredName,
    middleName: optionalText,
    lastName: requiredName,
    gender: optionalText,
    dateOfBirth: optionalDate,
    admissionDate: z.iso.date("Enter a valid admission date."),
    academicYearId: z
      .union([z.literal(""), z.uuid(), z.null()])
      .transform((value) => value || null),
    classSectionId: z
      .union([z.literal(""), z.uuid(), z.null()])
      .transform((value) => value || null),
    classNumber: optionalText,
    enrollmentStatus: z.enum(["ACTIVE", "REPEATING"]).default("ACTIVE"),
    capacityOverride: z.boolean().default(false),
    capacityOverrideReason: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((value) => value || null),
    guardianFirstName: optionalText,
    guardianMiddleName: optionalText,
    guardianLastName: optionalText,
    guardianPhone: z
      .string()
      .trim()
      .max(30)
      .nullable()
      .transform((value) => value || null),
    guardianEmail: z
      .union([z.literal(""), z.email(), z.null()])
      .transform((value) => value || null),
    guardianRelationship: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (Boolean(value.academicYearId) !== Boolean(value.classSectionId)) {
      context.addIssue({
        code: "custom",
        path: ["classSectionId"],
        message: "Choose both an academic year and class.",
      });
    }
    if (value.dateOfBirth && value.admissionDate < value.dateOfBirth) {
      context.addIssue({
        code: "custom",
        path: ["admissionDate"],
        message: "Admission cannot be before the date of birth.",
      });
    }
    const guardianStarted = Boolean(
      value.guardianFirstName ||
      value.guardianLastName ||
      value.guardianPhone ||
      value.guardianEmail,
    );
    if (
      guardianStarted &&
      (!value.guardianFirstName || !value.guardianLastName)
    ) {
      context.addIssue({
        code: "custom",
        path: ["guardianFirstName"],
        message: "Enter both guardian names.",
      });
    }
    if (value.capacityOverride && !value.capacityOverrideReason) {
      context.addIssue({
        code: "custom",
        path: ["capacityOverrideReason"],
        message: "Explain why capacity must be overridden.",
      });
    }
  });

export const studentProfileSchema = z
  .object({
    studentId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    admissionNumber: z.string().trim().min(1).max(100),
    firstName: requiredName,
    middleName: optionalText,
    lastName: requiredName,
    gender: optionalText,
    dateOfBirth: optionalDate,
    admissionDate: z.iso.date(),
  })
  .refine(
    (value) => !value.dateOfBirth || value.admissionDate >= value.dateOfBirth,
    {
      path: ["admissionDate"],
      message: "Admission cannot be before the date of birth.",
    },
  );

export const studentStatusSchema = z.object({
  studentId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  targetStatus: z.enum([
    "ACTIVE",
    "TRANSFERRED",
    "WITHDRAWN",
    "COMPLETED",
    "DECEASED",
    "INACTIVE",
  ]),
  effectiveDate: z.iso.date(),
  reason: z.string().trim().min(3, "Enter a meaningful reason.").max(500),
});

export const enrollmentSchema = z
  .object({
    studentId: z.uuid(),
    academicYearId: z.uuid(),
    classSectionId: z.uuid(),
    classNumber: optionalText,
    status: z.enum(["ACTIVE", "REPEATING"]),
    enrolledOn: z.iso.date(),
    capacityOverride: z.boolean().default(false),
    capacityOverrideReason: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((value) => value || null),
  })
  .refine(
    (value) => !value.capacityOverride || Boolean(value.capacityOverrideReason),
    {
      path: ["capacityOverrideReason"],
      message: "Explain the capacity override.",
    },
  );

export const enrollmentUpdateSchema = z.object({
  enrollmentId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  classNumber: optionalText,
  enrolledOn: z.iso.date(),
});

export const classMoveSchema = z
  .object({
    enrollmentId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    classSectionId: z.uuid(),
    classNumber: optionalText,
    capacityOverride: z.boolean().default(false),
    capacityOverrideReason: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((value) => value || null),
  })
  .refine(
    (value) => !value.capacityOverride || Boolean(value.capacityOverrideReason),
    {
      path: ["capacityOverrideReason"],
      message: "Explain the capacity override.",
    },
  );

export const enrollmentStatusSchema = z
  .object({
    enrollmentId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    targetStatus: z.enum([
      "ACTIVE",
      "REPEATING",
      "TRANSFERRED",
      "WITHDRAWN",
      "COMPLETED",
    ]),
    exitedOn: optionalDate,
    reason: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (
      ["TRANSFERRED", "WITHDRAWN", "COMPLETED"].includes(value.targetStatus) &&
      (!value.exitedOn || !value.reason)
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Terminal status changes require an exit date and reason.",
      });
    }
  });

export const guardianSchema = z.object({
  firstName: requiredName,
  middleName: optionalText,
  lastName: requiredName,
  phone: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^\+[1-9]\d{7,14}$/,
          "Use international E.164 format, for example +256…",
        ),
      z.null(),
    ])
    .transform((value) => value || null),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address."), z.null()])
    .transform((value) => value || null),
});

export const guardianLinkSchema = z.object({
  studentId: z.uuid(),
  guardianId: z.uuid(),
  relationship: z.string().trim().min(1).max(100),
  isPrimary: z.boolean(),
  canAccessReports: z.boolean(),
});

export const relationshipUpdateSchema = guardianLinkSchema
  .omit({ studentId: true, guardianId: true })
  .extend({
    relationshipId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  });

export type AdmissionInput = z.input<typeof admissionSchema>;
export type StudentProfileInput = z.input<typeof studentProfileSchema>;
