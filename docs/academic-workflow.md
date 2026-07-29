# Academic Workflow

## End-to-end workflow

```text
Academic setup
    ↓
Student enrolment
    ↓
Teacher assignment
    ↓
Assessment configuration
    ↓
Draft marks entry
    ↓
Marks submission
    ↓
Review and correction
    ↓
Approval and locking
    ↓
Result calculation
    ↓
Report readiness validation
    ↓
Report generation
    ↓
Report review
    ↓
Report publication
    ↓
Parent access
```

Each step must validate its prerequisites and record sensitive transitions. Later steps cannot be used to conceal incomplete or unapproved earlier work.

## Workflow stages

### Academic setup

Authorized administrators configure the academic year, term, classes, streams, subjects, and applicable rule versions. Configuration is validated before the period accepts marks.

### Student enrolment

Students are enrolled into the relevant academic period, class, and stream. Transfers, withdrawals, and other status changes remain historically traceable.

### Teacher assignment

Class teachers and subject teachers receive explicit, time-bound assignments. Assignment state drives access to rosters and marks.

### Assessment configuration

Authorized staff define assessment components, maximum scores, weights, grading scales, aggregate behavior, and completeness rules as data. Configuration is locked or versioned before finalized results depend on it.

### Draft marks entry

An assigned teacher records marks within configured limits. The system highlights invalid, missing, or inapplicable entries without granting access outside the assignment.

### Marks submission

The teacher attests that the scoped marks set is complete and submits it. Submission closes ordinary editing and creates an audit event.

### Review and correction

Authorized reviewers check completeness, outliers, configuration compliance, and supporting context. They may place work under review, return it with a reason, or advance it.

### Approval and locking

Authorized academic staff approve a valid submission and lock it against ordinary editing. Any exceptional unlock or post-approval change requires a reason, sufficient privilege, and audit trail.

### Result calculation

The calculation engine uses locked source marks and the applicable versioned rules to produce deterministic totals, averages, grades, aggregates, and eligible rankings.

### Report readiness validation

The system confirms required marks, configuration, calculation output, student details, comments, approval state, and other configured prerequisites before report generation.

### Report generation

An authorized action creates an immutable report snapshot and a private artifact. Failures are recorded and cannot produce a published report.

### Report review

Authorized staff review generated output for correctness and completeness. Review refers to a specific generated version.

### Report publication

Authorized leadership publishes an approved report version to the relevant student's portal. Publication is a separate action from generation and creates an audit record.

### Parent access

A parent or guardian establishes a restricted session using a verified student code and secure PIN, then sees only that student's published current and historical reports.

## Proposed mark states

| State          | Meaning                                                                | Typical transitions             |
| -------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `DRAFT`        | Editable marks are being prepared by an assigned teacher.              | `SUBMITTED`                     |
| `SUBMITTED`    | The teacher has submitted the scoped marks for review.                 | `UNDER_REVIEW`, `RETURNED`      |
| `UNDER_REVIEW` | Authorized academic staff are checking the submission.                 | `APPROVED`, `RETURNED`          |
| `APPROVED`     | The marks have passed review but are not yet immutable.                | `LOCKED`, controlled `RETURNED` |
| `LOCKED`       | Marks are finalized for calculation and ordinary edits are prohibited. | Exceptional audited unlock only |
| `RETURNED`     | A reviewer requires a documented correction.                           | `DRAFT`, then resubmission      |

State transitions must be performed by domain operations, not arbitrary status edits. The implementation must define who can trigger each transition, required reasons, validation conditions, and audit content.

## Proposed report states

| State        | Meaning                                                                 | Typical transitions                      |
| ------------ | ----------------------------------------------------------------------- | ---------------------------------------- |
| `DRAFT`      | A report request or snapshot preparation is incomplete.                 | `GENERATING`                             |
| `GENERATING` | Artifact creation is in progress.                                       | `GENERATED`, `FAILED`                    |
| `GENERATED`  | A private artifact exists and awaits review.                            | `REVIEWED`, `SUPERSEDED`                 |
| `REVIEWED`   | Authorized staff accepted the generated version.                        | `PUBLISHED`, `SUPERSEDED`                |
| `PUBLISHED`  | The version is available through the authorized parent portal.          | `WITHDRAWN`, `SUPERSEDED`                |
| `WITHDRAWN`  | Access to a previously published version has been revoked.              | `SUPERSEDED` or controlled republication |
| `FAILED`     | Generation did not complete successfully.                               | New generation attempt                   |
| `SUPERSEDED` | A newer report version replaces this version while history is retained. | Terminal                                 |

Generation and publication must remain separate actions. A generated report is private until the required review and publication authorization are complete.

## Corrections and recalculation

Corrections after locking must never overwrite history silently. The future design should identify the affected marks set, reason, authorizer, prior values, new values, recalculation version, and report versions that must be withdrawn or superseded.

## Term Three promotion flow

After final-term results are locked and calculated, configured rules produce a recommendation. Class teachers and academic staff review exceptions; the head teacher confirms the final decision and records reasons for overrides. A later rule change must not silently revise a confirmed historical decision.
