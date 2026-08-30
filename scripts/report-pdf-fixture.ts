import type { ReportPdfData } from "../src/lib/report-pdf/types";
import { reportSnapshotDataSchema } from "../src/lib/report-snapshots/schemas";

const id = (suffix: string) =>
  `c0000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const snapshot = reportSnapshotDataSchema.parse({
  snapshot_schema_version: 1,
  source: {
    calculation_run_id: id("1"),
    calculation_version: 4,
    input_checksum: "a".repeat(64),
    output_checksum: "b".repeat(64),
  },
  school: {
    id: id("2"),
    name: "Kampala Élan Primary School",
    school_code: "KEPS",
    address: "Plot 4, Kampala",
    phone: "+256 700 000000",
    email: "office@example.invalid",
    timezone: "Africa/Kampala",
    logo_storage_path: "logos/current.png",
    motto: "Learn with purpose",
    website: null,
  },
  student: {
    id: id("3"),
    admission_number: "S13-001",
    display_name: "Zoë Žurić",
    gender: "FEMALE",
    date_of_birth: "2014-06-12",
    photo_storage_path: "school/student/photo.png",
  },
  academic_period: {
    academic_year_id: id("4"),
    academic_year_name: "2026 Academic Year",
    term_id: id("5"),
    term_name: "Term Two",
    term_number: 2,
  },
  placement: {
    enrollment_id: id("6"),
    enrollment_status: "ACTIVE",
    class_section_id: id("7"),
    class_name: "P.6 Blue",
    class_code: "P6-B",
    grade_level_id: id("8"),
    grade_code: "P6",
    grade_name: "Primary Six",
  },
  academic_summary: {
    overall_total: 88,
    overall_average: 88,
    overall_grade: "A",
    aggregate_total: 3,
    aggregate_classification: "Advanced",
    subject_count: 3,
    complete_subject_count: 3,
    subjects_passed: 3,
    is_complete: true,
    ranking_eligible: true,
    class_position: 2,
    grade_level_position: 4,
    class_tie_size: 1,
    grade_level_tie_size: 1,
    class_is_tied: false,
    grade_level_is_tied: false,
  },
  attendance: {
    days_open: 60,
    days_present: 58,
    days_absent: 2,
    times_late: 1,
  },
  comments: {
    class_teacher_comment: "A thoughtful and consistent learner.",
    head_teacher_comment: "Keep building confidence.",
    conduct_grade: "Excellent",
  },
  signatories: {
    class_teacher: {
      display_name: "A. Teacher",
      role_context: "Class teacher",
    },
    head_teacher: { display_name: "B. Head", role_context: "Head teacher" },
  },
  next_term: {
    term_id: id("9"),
    term_name: "Term Three",
    term_number: 3,
    starts_on: "2026-09-07",
  },
});

export const reportPdfFixture: ReportPdfData = {
  report: {
    report_id: id("10"),
    enrollment_id: snapshot.placement.enrollment_id,
    calculation_run_id: snapshot.source.calculation_run_id,
    calculation_version: snapshot.source.calculation_version,
    report_version: 2,
    status: "GENERATED",
    created_at: "2026-08-30T00:00:00.000Z",
    superseded_by: null,
    snapshot_id: id("11"),
    snapshot_schema_version: 1,
    snapshot_data: snapshot,
    snapshot_checksum: "c".repeat(64),
    input_checksum: snapshot.source.input_checksum,
    output_checksum: snapshot.source.output_checksum,
  },
  subjects: [
    {
      report_id: id("10"),
      subject_id: id("12"),
      subject_code: "ENG",
      subject_name: "English",
      subject_score: 88,
      grade: "A",
      aggregate_points: 1,
      subject_position: 2,
      subject_status: "COMPLETE",
      is_pass: true,
      assessed_weight: 1,
      has_absence: true,
      has_exemption: false,
      subject_tie_size: 1,
      subject_is_tied: false,
      teacher_comment: "Strong reading.",
      sort_order: 1,
    },
    {
      report_id: id("10"),
      subject_id: id("13"),
      subject_code: "MAT",
      subject_name: "Mathematics",
      subject_score: 84,
      grade: "A",
      aggregate_points: 1,
      subject_position: 2,
      subject_status: "COMPLETE",
      is_pass: true,
      assessed_weight: 1,
      has_absence: false,
      has_exemption: false,
      subject_tie_size: 2,
      subject_is_tied: true,
      teacher_comment: null,
      sort_order: 2,
    },
    {
      report_id: id("10"),
      subject_id: id("14"),
      subject_code: "SCI",
      subject_name: "Science",
      subject_score: null,
      grade: null,
      aggregate_points: null,
      subject_position: null,
      subject_status: "EXEMPTED",
      is_pass: null,
      assessed_weight: 0,
      has_absence: false,
      has_exemption: true,
      subject_tie_size: 0,
      subject_is_tied: false,
      teacher_comment: null,
      sort_order: 3,
    },
  ],
};

const cloneFixture = () => structuredClone(reportPdfFixture);

export const reportPdfLongCommentFixture: ReportPdfData = (() => {
  const fixture = cloneFixture();
  fixture.report.snapshot_data.comments = {
    class_teacher_comment:
      "Class teacher observation: the learner has shown steady curiosity, careful collaboration, and a willingness to revise work after useful feedback. ".repeat(
        8,
      ),
    head_teacher_comment:
      "Head teacher observation: continue practising clear explanations, independent planning, respectful leadership, and consistent preparation for every learning activity. ".repeat(
        8,
      ),
    conduct_grade: "Excellent",
  };
  return fixture;
})();

export const reportPdfManySubjectsFixture: ReportPdfData = (() => {
  const fixture = cloneFixture();
  const template = fixture.subjects[0];
  fixture.subjects = Array.from({ length: 36 }, (_, index) => ({
    ...template,
    subject_id: id(String(100 + index)),
    subject_code: `S${String(index + 1).padStart(2, "0")}`,
    subject_name:
      index % 3 === 0
        ? `Integrated Long Curriculum Subject ${index + 1} — Communication and Practical Skills`
        : `Subject ${index + 1}`,
    subject_score: 60 + (index % 35),
    grade: index % 5 === 0 ? "B+" : "A",
    aggregate_points: 1,
    subject_position: index + 1,
    subject_is_tied: index === 1,
    subject_tie_size: index === 1 ? 2 : 1,
    has_absence: index === 4,
    has_exemption: false,
    sort_order: index + 1,
  }));
  fixture.report.snapshot_data.school.name =
    "Kampala Metropolitan Community Primary School and Learning Centre";
  fixture.report.snapshot_data.student.display_name =
    "Alexandria Mukasa Namukasa Long-Name Learner";
  fixture.report.snapshot_data.placement.class_name =
    "Primary Six Blue — Inclusive Learning Group";
  fixture.report.snapshot_data.comments = {
    class_teacher_comment:
      "Long-form class teacher comment for the multipage visual fixture. ".repeat(
        8,
      ),
    head_teacher_comment:
      "Long-form head teacher comment for the multipage visual fixture. ".repeat(
        8,
      ),
    conduct_grade: "Excellent",
  };
  return fixture;
})();

export const reportPdfMaliciousTextFixture: ReportPdfData = (() => {
  const fixture = cloneFixture();
  fixture.report.snapshot_data.school.email = "javascript:alert(1)";
  fixture.report.snapshot_data.school.website = "https://evil.invalid";
  fixture.report.snapshot_data.school.motto = ")/Launch( ordinary report text";
  return fixture;
})();
