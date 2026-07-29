# Product Requirements

## Product objective

The Primary School Academic Results and Report Management System will provide one controlled workflow for configuring an academic period, enrolling learners, assigning teachers, capturing and approving marks, calculating results, publishing reports, and reviewing schoolwide academic performance.

The system must be adaptable to the policies and report format of the adopting school. Configuration must be stored as data and versioned where historical accuracy depends on it.

## Users

- School administrators who configure the institution and manage users
- Head teachers and authorized academic leaders who provide final oversight
- Academic registrars who review result completeness and accuracy
- Class teachers who oversee full-class academic results
- Subject teachers who enter marks within assigned classes and subjects
- Parents or guardians who access a verified student's published reports

## MVP scope

### Staff authentication

Authorized staff can sign in and sign out through Supabase Auth. Sessions, account status, and recovery flows must be handled securely. Authentication identifies a user; it does not by itself grant academic access.

### Role-based authorization

Staff capabilities are determined by explicit roles and contextual assignments. Sensitive authorization is enforced in server-side application logic and Row Level Security.

### Academic year and term management

Administrators can create and manage academic years and terms, including active periods and lifecycle state. Historical results remain tied to the configuration that applied when they were produced.

### Classes and streams

Administrators can configure class levels and optional streams without relying on hard-coded names. Students and teacher assignments are associated with the appropriate academic period, class, and stream.

### Subjects

Administrators can configure subjects, their applicability, display order, and relevant academic settings. Subject lists are not embedded in source code.

### Teachers

Administrators can maintain teacher profiles linked to authenticated staff accounts where appropriate, including active or inactive status.

### Teacher assignments

Administrators can assign subject teachers to defined classes, streams, subjects, and academic periods, and assign class teachers to their classes. Access must follow current assignments.

### Student management

Authorized staff can create and update student records, allocate secure student access codes, manage enrolment by academic period, and track status without exposing private information unnecessarily.

### Marks entry

Subject teachers can enter and revise draft marks only for students, subjects, assessments, classes, streams, and periods within their assignment. Validation must enforce configured ranges and required components.

### Marks submission, review, approval, and locking

Marks move through a controlled state workflow. Submitted marks can be reviewed, returned with a reason, corrected, approved, and locked by authorized staff. Locked marks cannot be silently changed.

### Configurable grading scales

Authorized staff can define grading bands, labels, points or aggregates, comments, and effective academic scope. Changes must not retroactively alter finalized historical results unless an explicit, audited recalculation is performed.

### Aggregate calculation

The system calculates aggregates using the school's configured rules. Rule inputs, subject selection, edge cases, and effective dates must be explicit and testable.

### Rankings

The system can calculate student and subject rankings within an authorized academic scope using configured tie-handling and eligibility rules. Ranking behavior must be transparent and reproducible.

### Student report generation

Authorized staff can generate immutable report snapshots for a student, class, or wider school scope after readiness checks pass. The final PDF layout is deferred until a real approved report-card sample is provided.

### Private report storage

Generated report artifacts are stored in private Supabase Storage. A storage path or object identifier alone must not authorize access.

### Report publication

Authorized staff review generated reports before publishing them to the relevant student portal. Generation and publication are separate, auditable actions; reports can be withdrawn or superseded without rewriting history.

### Parent code and PIN verification

A parent or guardian can submit a student code and secure PIN to establish restricted access. Verification must resist brute force and enumeration, store PIN verifiers rather than plaintext PINs, and reveal only the verified student's published reports.

### Historical reports

Verified parents and authorized staff can access published historical reports within their permitted student scope. Historical reports retain the academic rules and data snapshot used at generation time.

### Academic analytics

Authorized academic staff can view aggregate distributions, top students, class averages, subject performance, best and weakest subjects, students who may require support, and recommendation summaries. Analytics must respect permissions and clearly define populations and exclusions.

### Term Three promotion recommendations

For the configured final term, the system can calculate promotion or repetition recommendations from database-configured rules. A recommendation is not a final decision; authorized leadership confirms the outcome and records any override reason.

### Audit logging

Sensitive events record the actor, action, time, target, relevant state transition, and safe contextual metadata. Audit records must cover authorization changes, marks workflow events, calculation and generation events, publication actions, promotion decisions, and exceptional overrides.

## Outside the first MVP

- School fees
- Payroll
- Inventory
- Library management
- Transport
- Hostel management
- Biometric attendance
- Full learning-management functionality
- Native mobile applications

These areas should not influence the initial schema or interface unless a reviewed architecture decision establishes a concrete MVP dependency.

## Cross-cutting requirements

- No school name, logo, subject set, class set, stream set, grading scale, aggregate formula, assessment weighting, promotion threshold, or final report-card layout is hard-coded.
- Personal and academic data is collected and exposed only as required for an authorized workflow.
- Calculations are deterministic, testable, and traceable to a versioned configuration and source-mark snapshot.
- All sensitive authorization is enforced server-side and reinforced with Row Level Security.
- User-facing operations provide clear validation and workflow-state feedback.
- Accessibility, responsive behavior, operational observability, backup, recovery, and retention requirements are defined before production release.

## Deferred decisions

The school identity, approved subject catalogue, class and stream structure, assessment model, grading and aggregate rules, promotion policy, student-code format, retention rules, and final report-card design remain pending stakeholder input.
