import { describe, expect, it } from "vitest";

import {
  admissionSchema,
  enrollmentSchema,
  guardianSchema,
  studentStatusSchema,
} from "./schemas";

describe("student-management schemas", () => {
  it("normalizes optional admission fields", () => {
    const result = admissionSchema.parse({
      admissionNumber: " STG-001 ",
      firstName: " Ada ",
      middleName: " ",
      lastName: " O'Neil-Smith ",
      gender: "",
      dateOfBirth: "",
      admissionDate: "2026-02-01",
      academicYearId: "",
      classSectionId: "",
      classNumber: "",
      enrollmentStatus: "ACTIVE",
      capacityOverride: false,
      capacityOverrideReason: "",
      guardianFirstName: "",
      guardianMiddleName: "",
      guardianLastName: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianRelationship: "Guardian",
    });
    expect(result).toMatchObject({
      admissionNumber: "STG-001",
      firstName: "Ada",
      middleName: null,
      lastName: "O'Neil-Smith",
      dateOfBirth: null,
    });
  });

  it("requires year and class together", () => {
    const result = admissionSchema.safeParse({
      admissionNumber: "STG-001",
      firstName: "Ada",
      middleName: "",
      lastName: "Lovelace",
      gender: "",
      dateOfBirth: "",
      admissionDate: "2026-02-01",
      academicYearId: "10000000-0000-4000-8000-000000000001",
      classSectionId: "",
      classNumber: "",
      enrollmentStatus: "ACTIVE",
      capacityOverride: false,
      capacityOverrideReason: "",
      guardianFirstName: "",
      guardianMiddleName: "",
      guardianLastName: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianRelationship: "Guardian",
    });
    expect(result.success).toBe(false);
  });

  it("rejects admission before birth", () => {
    const result = admissionSchema.safeParse({
      admissionNumber: "STG-001",
      firstName: "Ada",
      middleName: "",
      lastName: "Lovelace",
      gender: "",
      dateOfBirth: "2026-03-01",
      admissionDate: "2026-02-01",
      academicYearId: "",
      classSectionId: "",
      classNumber: "",
      enrollmentStatus: "ACTIVE",
      capacityOverride: false,
      capacityOverrideReason: "",
      guardianFirstName: "",
      guardianMiddleName: "",
      guardianLastName: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianRelationship: "Guardian",
    });
    expect(result.success).toBe(false);
  });

  it("requires capacity override reasons", () => {
    const result = enrollmentSchema.safeParse({
      studentId: "10000000-0000-4000-8000-000000000001",
      academicYearId: "20000000-0000-4000-8000-000000000001",
      classSectionId: "30000000-0000-4000-8000-000000000001",
      classNumber: "1",
      status: "ACTIVE",
      enrolledOn: "2026-02-01",
      capacityOverride: true,
      capacityOverrideReason: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts international E.164 guardian phones", () => {
    expect(
      guardianSchema.parse({
        firstName: "Grace",
        middleName: "",
        lastName: "Hopper",
        phone: "+14155552671",
        email: "GRACE@EXAMPLE.INVALID",
      }),
    ).toMatchObject({ phone: "+14155552671" });
  });

  it("rejects local-only guardian phone formats", () => {
    expect(
      guardianSchema.safeParse({
        firstName: "Grace",
        middleName: "",
        lastName: "Hopper",
        phone: "0772123456",
        email: "",
      }).success,
    ).toBe(false);
  });

  it("requires a meaningful lifecycle reason", () => {
    expect(
      studentStatusSchema.safeParse({
        studentId: "10000000-0000-4000-8000-000000000001",
        expectedUpdatedAt: "2026-08-01T00:00:00Z",
        targetStatus: "WITHDRAWN",
        effectiveDate: "2026-08-01",
        reason: "",
      }).success,
    ).toBe(false);
  });
});
