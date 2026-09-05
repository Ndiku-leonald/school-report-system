import { z } from "zod";

const id = z.uuid("Select a valid record.");
const timestamp = z.iso.datetime({ offset: true });
const optionalId = z
  .union([id, z.literal("")])
  .transform((value) => value || null);
const trimmedName = (maximum: number) =>
  z.string().trim().min(1, "Enter a name.").max(maximum);
const positiveInteger = z.coerce.number().int().positive();
const optionalPositiveInteger = z
  .union([z.coerce.number().int().positive(), z.literal("")])
  .transform((value) => value || null);
const optionalNonnegativeInteger = z
  .union([z.coerce.number().int().nonnegative(), z.literal("")])
  .transform((value) => (value === "" ? null : value));
const percentage = z.coerce.number().min(0).max(100);
const optionalPercentage = z
  .union([percentage, z.literal("")])
  .transform((value) => (value === "" ? null : value));

export const mutationIdentitySchema = z.object({
  id,
  expectedUpdatedAt: timestamp,
});

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

export const academicYearUpdateSchema = academicYearSchema.and(
  mutationIdentitySchema,
);

const termFieldsSchema = z.object({
  academicYearId: id,
  name: trimmedName(100),
  termNumber: positiveInteger,
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isPromotionTerm: z.boolean().default(false),
});

export const termSchema = termFieldsSchema.refine(
  (value) => value.endsOn > value.startsOn,
  {
    message: "The end date must be after the start date.",
    path: ["endsOn"],
  },
);

export const termUpdateSchema = termFieldsSchema
  .omit({ academicYearId: true })
  .extend({ id, expectedUpdatedAt: timestamp })
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

export const gradeLevelUpdateSchema = gradeLevelSchema.and(
  mutationIdentitySchema,
);

export const orderedConfigurationItemSchema = z.object({
  id,
  expectedUpdatedAt: timestamp,
  sortOrder: positiveInteger,
});

export const reorderConfigurationSchema = z
  .array(orderedConfigurationItemSchema)
  .min(1, "Add at least one ordered record.")
  .superRefine((items, context) => {
    const ids = new Set(items.map((item) => item.id));
    const orders = new Set(items.map((item) => item.sortOrder));
    if (ids.size !== items.length || orders.size !== items.length) {
      context.addIssue({
        code: "custom",
        message: "Every reordered record and position must be unique.",
      });
    }
  });

export const classSectionSchema = z.object({
  academicYearId: id,
  gradeLevelId: id,
  name: trimmedName(100),
  classCode: trimmedName(50),
  capacity: optionalPositiveInteger,
});

export const classSectionUpdateSchema = classSectionSchema.and(
  mutationIdentitySchema,
);

export const subjectSchema = z.object({
  code: trimmedName(50),
  name: trimmedName(150),
  description: z.string().trim().max(500).default(""),
  isCore: z.boolean().default(false),
  contributesToAggregate: z.boolean().default(true),
  sortOrder: positiveInteger,
});

export const subjectUpdateSchema = subjectSchema.and(mutationIdentitySchema);

export const curriculumMappingSchema = z.object({
  gradeLevelId: id,
  subjectId: id,
  isRequired: z.boolean().default(true),
  contributesToAggregate: z.boolean().default(true),
  sortOrder: positiveInteger,
});

export const curriculumMappingUpdateSchema = z
  .object({
    isRequired: z.boolean().default(true),
    contributesToAggregate: z.boolean().default(true),
    sortOrder: positiveInteger,
  })
  .and(mutationIdentitySchema);

export const assessmentComponentSchema = z.object({
  name: trimmedName(150),
  componentCode: trimmedName(50),
  maximumScore: z.coerce.number().positive(),
  weightPercentage: z.coerce.number().positive().max(100),
  sortOrder: positiveInteger,
  isRequired: z.boolean().default(true),
});

const assessmentSchemeFieldsSchema = z.object({
  termId: id,
  gradeLevelId: id,
  subjectId: id,
  name: trimmedName(150),
  effectiveFrom: z.iso.date(),
  components: z.array(assessmentComponentSchema).min(1),
});

function validateAssessmentComponents(
  value: { components: z.infer<typeof assessmentComponentSchema>[] },
  context: z.RefinementCtx,
) {
  if (
    new Set(value.components.map((component) => component.componentCode))
      .size !== value.components.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Component codes must be unique.",
      path: ["components"],
    });
  }
  if (
    new Set(value.components.map((component) => component.sortOrder)).size !==
    value.components.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Component positions must be unique.",
      path: ["components"],
    });
  }
}

export const assessmentSchemeSchema = assessmentSchemeFieldsSchema.superRefine(
  validateAssessmentComponents,
);

export const assessmentSchemeUpdateSchema = assessmentSchemeFieldsSchema
  .extend({ id, expectedUpdatedAt: timestamp })
  .superRefine(validateAssessmentComponents);

export const assessmentSchemeVersionSchema = assessmentSchemeFieldsSchema
  .pick({
    name: true,
    effectiveFrom: true,
    components: true,
  })
  .extend({
    sourceId: id,
    expectedUpdatedAt: timestamp,
  })
  .superRefine(validateAssessmentComponents);

export const gradingBandSchema = z
  .object({
    minimumScore: percentage,
    maximumScore: percentage,
    grade: trimmedName(20),
    aggregatePoints: optionalPositiveInteger,
    description: z.string().trim().max(300).default(""),
    isPass: z.boolean().default(true),
    sortOrder: positiveInteger,
  })
  .refine((value) => value.maximumScore > value.minimumScore, {
    message: "Maximum score must be greater than minimum score.",
    path: ["maximumScore"],
  });

const gradingScaleFieldsSchema = z.object({
  academicYearId: optionalId,
  gradeLevelId: optionalId,
  name: trimmedName(150),
  effectiveFrom: z.iso.date(),
  bands: z.array(gradingBandSchema).min(1),
});

function validateGradingBands(
  value: { bands: z.infer<typeof gradingBandSchema>[] },
  context: z.RefinementCtx,
) {
  const sorted = [...value.bands].sort(
    (left, right) => left.minimumScore - right.minimumScore,
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.minimumScore < previous.maximumScore) {
      context.addIssue({
        code: "custom",
        message: `${previous.grade} overlaps ${current.grade}.`,
        path: ["bands"],
      });
    }
  }
  if (
    new Set(value.bands.map((band) => band.sortOrder)).size !==
    value.bands.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Band positions must be unique.",
      path: ["bands"],
    });
  }
}

export const gradingScaleSchema =
  gradingScaleFieldsSchema.superRefine(validateGradingBands);

export const gradingScaleUpdateSchema = gradingScaleFieldsSchema
  .extend({ id, expectedUpdatedAt: timestamp })
  .superRefine(validateGradingBands);

export const gradingScaleVersionSchema = gradingScaleFieldsSchema
  .pick({ name: true, effectiveFrom: true, bands: true })
  .extend({
    sourceId: id,
    expectedUpdatedAt: timestamp,
  })
  .superRefine(validateGradingBands);

const rankingConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    direction: z.enum(["ASC", "DESC"]),
    includeIncomplete: z.boolean(),
    minimumSubjects: optionalNonnegativeInteger,
    configuredMetric: z
      .enum(["TOTAL", "AVERAGE", "AGGREGATE"])
      .nullable()
      .default(null),
  })
  .strict();

const rankingRuleFieldsSchema = z.object({
  academicYearId: optionalId,
  gradeLevelId: optionalId,
  name: trimmedName(150),
  rankingBasis: z.enum(["TOTAL", "AVERAGE", "AGGREGATE", "CONFIGURED"]),
  tieMethod: z.enum(["DENSE", "COMPETITION", "ORDINAL", "SHARED"]),
  configuration: rankingConfigurationSchema,
});

function validateRankingConfiguration(
  value: Pick<
    z.infer<typeof rankingRuleFieldsSchema>,
    "rankingBasis" | "configuration"
  >,
  context: z.RefinementCtx,
) {
  const configured = value.rankingBasis === "CONFIGURED";
  if (configured !== (value.configuration.configuredMetric !== null)) {
    context.addIssue({
      code: "custom",
      message:
        "Choose a configured metric only when the configured basis is selected.",
      path: ["configuration", "configuredMetric"],
    });
  }
  const requiredDirection = value.rankingBasis === "AGGREGATE" ? "ASC" : "DESC";
  if (!configured && value.configuration.direction !== requiredDirection) {
    context.addIssue({
      code: "custom",
      message: `${value.rankingBasis} rankings must use ${requiredDirection === "ASC" ? "lowest" : "highest"} first.`,
      path: ["configuration", "direction"],
    });
  }
}

export const rankingRuleSchema = rankingRuleFieldsSchema.superRefine(
  validateRankingConfiguration,
);

export const rankingRuleUpdateSchema = rankingRuleFieldsSchema
  .extend({ id, expectedUpdatedAt: timestamp })
  .superRefine(validateRankingConfiguration);

export const rankingRuleVersionSchema = rankingRuleFieldsSchema
  .omit({ academicYearId: true, gradeLevelId: true })
  .extend({
    sourceId: id,
    expectedUpdatedAt: timestamp,
  })
  .superRefine(validateRankingConfiguration);

export const requiredSubjectRuleSchema = z
  .object({
    subjectId: id,
    require: z.enum(["PASS", "COMPLETE"]),
  })
  .strict();

const promotionAdditionalRulesSchema = z
  .object({
    schemaVersion: z.literal(1),
    requireCompleteResult: z.boolean(),
    successOutcome: z.enum(["PROMOTED", "PROMOTED_WITH_SUPPORT"]),
    failureOutcome: z.enum(["ACADEMIC_REVIEW", "REPEAT_RECOMMENDED"]),
    incompleteOutcome: z.enum(["ACADEMIC_REVIEW", "REPEAT_RECOMMENDED"]),
  })
  .strict();

export const promotionRuleSchema = z.object({
  academicYearId: optionalId,
  gradeLevelId: optionalId,
  name: trimmedName(150),
  minimumAverage: optionalPercentage,
  maximumAggregate: optionalPositiveInteger,
  minimumSubjectsPassed: optionalNonnegativeInteger,
  minimumAttendancePercentage: optionalPercentage,
  requiredSubjectRules: z
    .array(requiredSubjectRuleSchema)
    .superRefine((rules, context) => {
      if (new Set(rules.map((rule) => rule.subjectId)).size !== rules.length) {
        context.addIssue({
          code: "custom",
          message: "Each required subject may appear only once.",
        });
      }
    }),
  additionalRules: promotionAdditionalRulesSchema,
});

export const promotionRuleUpdateSchema = promotionRuleSchema.and(
  mutationIdentitySchema,
);

export const promotionRuleVersionSchema = promotionRuleSchema
  .omit({ academicYearId: true, gradeLevelId: true })
  .and(
    z.object({
      sourceId: id,
      expectedUpdatedAt: timestamp,
    }),
  );

export type AcademicYearInput = z.infer<typeof academicYearSchema>;
export type GradeLevelInput = z.infer<typeof gradeLevelSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type AssessmentSchemeInput = z.infer<typeof assessmentSchemeSchema>;
export type GradingScaleInput = z.infer<typeof gradingScaleSchema>;
export type RankingRuleInput = z.infer<typeof rankingRuleSchema>;
export type PromotionRuleInput = z.infer<typeof promotionRuleSchema>;
