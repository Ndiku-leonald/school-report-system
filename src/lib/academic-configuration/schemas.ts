import { z } from "zod";

const id = z.uuid("Select a valid record.");
const timestamp = z.iso.datetime({ offset: true });
const optionalId = z
  .union([id, z.literal("")])
  .transform((value) => value || null);
const trimmedName = (maximum: number) =>
  z.string().trim().min(1, "Enter a name.").max(maximum);
const positiveInteger = z.coerce.number().int().positive();
const percentage = z.coerce.number().min(0).max(100);

export const academicYearSchema = z
  .object({
    name: trimmedName(100),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((value) => value.endsOn > value.startsOn, {
    message: "The end date must be after the start date.",
    path: ["endsOn"],
  });

export const termSchema = z
  .object({
    academicYearId: id,
    name: trimmedName(100),
    termNumber: positiveInteger,
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    isPromotionTerm: z.boolean().default(false),
  })
  .refine((value) => value.endsOn > value.startsOn, {
    message: "The end date must be after the start date.",
    path: ["endsOn"],
  });

export const gradeLevelSchema = z.object({
  code: trimmedName(50),
  name: trimmedName(100),
  sortOrder: positiveInteger,
  isFinalGrade: z.boolean().default(false),
});

export const classSectionSchema = z.object({
  academicYearId: id,
  gradeLevelId: id,
  name: trimmedName(100),
  classCode: trimmedName(50),
  capacity: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .transform((value) => value || null),
});

export const subjectSchema = z.object({
  code: trimmedName(50),
  name: trimmedName(150),
  description: z.string().trim().max(500).default(""),
  isCore: z.boolean().default(false),
  contributesToAggregate: z.boolean().default(true),
  sortOrder: positiveInteger,
});

export const curriculumMappingSchema = z.object({
  gradeLevelId: id,
  subjectId: id,
  isRequired: z.boolean().default(true),
  contributesToAggregate: z.boolean().default(true),
  sortOrder: positiveInteger,
});

export const assessmentComponentSchema = z.object({
  name: trimmedName(150),
  componentCode: trimmedName(50),
  maximumScore: z.coerce.number().positive(),
  weightPercentage: z.coerce.number().positive().max(100),
  sortOrder: positiveInteger,
  isRequired: z.boolean().default(true),
});

export const assessmentSchemeSchema = z
  .object({
    termId: id,
    gradeLevelId: id,
    subjectId: id,
    name: trimmedName(150),
    effectiveFrom: z.iso.date(),
    components: z.array(assessmentComponentSchema).min(1),
  })
  .refine(
    (value) =>
      new Set(value.components.map((component) => component.componentCode))
        .size === value.components.length,
    { message: "Component codes must be unique.", path: ["components"] },
  );

export const gradingBandSchema = z.object({
  minimumScore: percentage,
  maximumScore: percentage,
  grade: trimmedName(20),
  aggregatePoints: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .transform((value) => value || null),
  description: z.string().trim().max(300).default(""),
  isPass: z.boolean().default(true),
  sortOrder: positiveInteger,
});

export const gradingScaleSchema = z.object({
  academicYearId: optionalId,
  gradeLevelId: optionalId,
  name: trimmedName(150),
  effectiveFrom: z.iso.date(),
  bands: z.array(gradingBandSchema).min(1),
});

export const rankingRuleSchema = z.object({
  academicYearId: optionalId,
  gradeLevelId: optionalId,
  name: trimmedName(150),
  rankingBasis: z.enum(["TOTAL", "AVERAGE", "AGGREGATE", "CONFIGURED"]),
  tieMethod: z.enum(["DENSE", "COMPETITION", "ORDINAL", "SHARED"]),
  configuration: z.record(z.string(), z.json()).default({}),
});

export const promotionRuleSchema = z.object({
  academicYearId: optionalId,
  gradeLevelId: optionalId,
  name: trimmedName(150),
  minimumAverage: z
    .union([percentage, z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  maximumAggregate: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .transform((value) => value || null),
  minimumSubjectsPassed: z
    .union([z.coerce.number().int().nonnegative(), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  minimumAttendancePercentage: z
    .union([percentage, z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  requiredSubjectRules: z.record(z.string(), z.json()).default({}),
  additionalRules: z.record(z.string(), z.json()).default({}),
});

export const mutationIdentitySchema = z.object({
  id,
  expectedUpdatedAt: timestamp,
});

export type AcademicYearInput = z.infer<typeof academicYearSchema>;
export type GradeLevelInput = z.infer<typeof gradeLevelSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
