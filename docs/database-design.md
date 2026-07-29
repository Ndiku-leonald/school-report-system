# Database Design

## Scope and source of truth

The Supabase migrations in `supabase/migrations` are the only schema source of
truth. They create a normalized foundation for academic configuration, marks
workflow, reports, parent-access credentials, and audit records. Application
screens, calculations, authentication flows, storage buckets, and final
authorization policies are intentionally deferred.

The local seed is configuration-only synthetic data. Grade levels, subjects,
assessment weights, grading thresholds, and school identity remain data-driven;
the seed is an example, not production policy.

## Entity groups and ownership

- **School and identity:** `schools` owns school-scoped data.
  `school_staff_memberships` links an Auth-backed `profile` to a school, and
  `staff_role_assignments` gives a membership zero or more roles.
- **Academic structure:** an `academic_year` owns terms and class sections.
  Grade levels and subjects belong to a school and are joined through
  `grade_level_subjects`.
- **Learners:** students and guardians belong to a school and form a many-to-many
  relationship through `student_guardians`. Enrollments place a student in one
  class section for an academic year while retaining prior years.
- **Teaching and assessment:** term-scoped teaching and class-teacher
  assignments identify staff scope. Versioned assessment schemes own weighted
  components.
- **Results:** a mark sheet is the workflow aggregate for one class, subject,
  term, scheme, and teaching assignment. Marks attach an enrollment and
  assessment component to that sheet.
- **Rules:** grading scales, ranking rules, and promotion rules are versioned and
  can be scoped to a school, year, or grade level.
- **Reports:** batches coordinate generation. Reports are versioned records;
  immutable snapshots preserve the source used for historical rendering.
- **Restricted access and audit:** parent credentials and sessions store hashes
  only. Audit events are append-only.

```mermaid
erDiagram
  SCHOOLS ||--o{ ACADEMIC_YEARS : owns
  SCHOOLS ||--o{ SCHOOL_STAFF_MEMBERSHIPS : employs
  PROFILES ||--o{ SCHOOL_STAFF_MEMBERSHIPS : joins
  SCHOOL_STAFF_MEMBERSHIPS ||--o{ STAFF_ROLE_ASSIGNMENTS : has
  ACADEMIC_YEARS ||--o{ TERMS : contains
  ACADEMIC_YEARS ||--o{ CLASS_SECTIONS : contains
  GRADE_LEVELS ||--o{ CLASS_SECTIONS : groups
  GRADE_LEVELS ||--o{ GRADE_LEVEL_SUBJECTS : offers
  SUBJECTS ||--o{ GRADE_LEVEL_SUBJECTS : maps
  STUDENTS ||--o{ ENROLLMENTS : has
  CLASS_SECTIONS ||--o{ ENROLLMENTS : contains
  TERMS ||--o{ TEACHING_ASSIGNMENTS : scopes
  CLASS_SECTIONS ||--o{ TEACHING_ASSIGNMENTS : receives
  SUBJECTS ||--o{ TEACHING_ASSIGNMENTS : covers
  ASSESSMENT_SCHEMES ||--o{ ASSESSMENT_COMPONENTS : defines
  TEACHING_ASSIGNMENTS ||--o{ MARK_SHEETS : authorizes
  MARK_SHEETS ||--o{ MARKS : contains
  ENROLLMENTS ||--o{ MARKS : receives
  REPORT_BATCHES ||--o{ REPORTS : coordinates
  ENROLLMENTS ||--o{ REPORTS : receives
  REPORTS ||--o{ REPORT_SNAPSHOTS : freezes
  REPORTS ||--o{ REPORT_SUBJECT_RESULTS : summarizes
  STUDENTS ||--o{ STUDENT_ACCESS_CREDENTIALS : secures
```

## Integrity and history

Users can have several roles because authorization responsibilities overlap and
change independently. Revoking a role timestamps the assignment instead of
rewriting history. Staff memberships, enrollments, teaching assignments, and
class-teacher assignments similarly use status or effective dates.

Workflow state lives on `mark_sheets`, not individual marks. This makes a
teacher's complete class-subject result set the unit of submission, review,
return, approval, and locking. Sheet versions preserve revisions, while each
mark's `row_version` provides a future optimistic-concurrency boundary.

Rules and report templates are versioned. Active-record partial unique indexes
prevent conflicting current versions while retaining retired records. Reports
use immutable JSON snapshots so later edits to live marks or configuration
cannot silently change an already generated historical report.

Key database checks include:

- one active academic year per school;
- terms within their year and class sections within the same school/year;
- one active enrollment per student and academic year;
- school-consistent guardian, subject, staff, and assignment relationships;
- active assessment components totaling exactly 100 percent;
- scores consistent with attendance, component maximums, and class enrollment;
- non-overlapping grading bands with adjacent boundaries allowed;
- valid report counters, versions, lifecycle timestamps, and academic scope;
- override reasons and promotion-term confirmation requirements; and
- one active parent credential per student, with hashes rather than plaintext.

## Deletion decisions

Foreign keys use `ON DELETE RESTRICT` throughout the Stage 3 academic model.
Schools, people, academic periods, assignments, marks, reports, promotion
decisions, credentials, and audit records may carry historical or security
meaning and must not disappear through a cascading parent deletion. Lifecycle
status, revocation, expiry, withdrawal, supersession, or archival is preferred.

Even dependent configuration and junction rows are restricted in this stage.
This conservative choice prevents accidental loss before controlled
administrative workflows and audit behavior exist. A future migration may
introduce a narrowly justified cascade only with migration tests and documented
retention impact.

## Deferred structures

Ranking and promotion JSON configuration, report template configuration,
storage paths, report artifact checksums, and parent session metadata are
schema foundations for later stages. Stage 3 does not implement calculation
engines, final report layouts, storage policies, parent verification, or
automatic promotion.
