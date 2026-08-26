import { z } from "zod";

const id = z.uuid("Select a valid record.");
const timestamp = z.iso.datetime({ offset: true });

export const calculateResultsSchema = z.object({
  termId: id,
  gradeLevelId: id,
  gradingScaleId: id,
  rankingRuleId: id,
  classificationScaleId: z
    .union([id, z.literal("")])
    .transform((value) => value || null),
});

export const aggregateClassificationBandSchema = z
  .object({
    minimumAggregate: z.coerce.number().int().nonnegative(),
    maximumAggregate: z.coerce.number().int().nonnegative(),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).default(""),
    sortOrder: z.coerce.number().int().positive(),
  })
  .refine((band) => band.maximumAggregate >= band.minimumAggregate, {
    message: "The maximum aggregate must not be below the minimum aggregate.",
    path: ["maximumAggregate"],
  });

const classificationFields = z.object({
  academicYearId: z
    .union([id, z.literal("")])
    .transform((value) => value || null),
  gradeLevelId: z
    .union([id, z.literal("")])
    .transform((value) => value || null),
  name: z.string().trim().min(1).max(150),
  bands: z.array(aggregateClassificationBandSchema).min(1),
});

export const aggregateClassificationSchema = classificationFields.superRefine(
  (value, context) => {
    const ordered = [...value.bands].sort(
      (left, right) => left.minimumAggregate - right.minimumAggregate,
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (
        ordered[index]!.minimumAggregate <= ordered[index - 1]!.maximumAggregate
      ) {
        context.addIssue({
          code: "custom",
          path: ["bands"],
          message: "Classification ranges must not overlap.",
        });
      }
    }
    if (
      new Set(value.bands.map((band) => band.sortOrder)).size !==
      value.bands.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["bands"],
        message: "Band positions must be unique.",
      });
    }
  },
);

export const aggregateClassificationUpdateSchema = classificationFields.extend({
  id,
  expectedUpdatedAt: timestamp,
});

export const aggregateClassificationVersionSchema = classificationFields.extend(
  {
    sourceId: id,
    expectedUpdatedAt: timestamp,
  },
);
