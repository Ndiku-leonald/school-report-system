import { join } from "node:path";

import PDFDocument from "pdfkit";

import type { ReportSnapshotData } from "@/lib/report-snapshots/types";

import {
  pdfDate,
  pdfNumber,
  pdfPosition,
  pdfSubjectStatus,
  pdfText,
} from "./format";
import type { ReportPdfData } from "./types";

export const REPORT_PDF_LAYOUT_VERSION = "report-card-a4-v2";
export const REPORT_PDF_FIXED_DATE = new Date("2000-01-01T00:00:00.000Z");

const normalFont = join(
  process.cwd(),
  "assets",
  "fonts",
  "report-noto-sans-400.ttf",
);
const boldFont = join(
  process.cwd(),
  "assets",
  "fonts",
  "report-noto-sans-700.ttf",
);
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 36;
const RIGHT = PAGE_WIDTH - 36;
const CONTENT_BOTTOM = PAGE_HEIGHT - 52;
const INK = "#111111";
const MUTED = "#4b4b4b";
const RULE = "#777777";
const LIGHT = "#eeeeee";
const COLUMN_GAP = 7;

type Pdf = InstanceType<typeof PDFDocument>;
type PageState = { pageNumber: number };

function drawFooter(doc: Pdf, pageNumber: number, pageCount: number) {
  doc
    .font(normalFont)
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      `PDF available to authorized staff. Publication and parent access are unavailable. | Page ${pageNumber} of ${pageCount} | Layout ${REPORT_PDF_LAYOUT_VERSION}`,
      LEFT,
      PAGE_HEIGHT - 29,
      { align: "center", width: RIGHT - LEFT, lineBreak: false },
    );
}

function newPage(doc: Pdf, state: PageState) {
  doc.addPage({ size: "A4", margin: 0 });
  state.pageNumber += 1;
  doc.x = LEFT;
  doc.y = 36;
}

function ensureSpace(
  doc: Pdf,
  state: PageState,
  requiredHeight: number,
  onNewPage?: () => void,
) {
  if (doc.y + requiredHeight <= CONTENT_BOTTOM) return;
  newPage(doc, state);
  onNewPage?.();
}

function section(doc: Pdf, title: string) {
  const y = doc.y;
  doc
    .font(boldFont)
    .fontSize(10)
    .fillColor(INK)
    .text(title, LEFT, y, { width: RIGHT - LEFT, lineBreak: false });
  doc
    .moveTo(LEFT, y + 15)
    .lineTo(RIGHT, y + 15)
    .lineWidth(0.7)
    .strokeColor(RULE)
    .stroke();
  doc.y = y + 23;
}

function textHeight(doc: Pdf, value: string, width: number, fontSize: number) {
  doc.font(normalFont).fontSize(fontSize);
  return doc.heightOfString(value, { width, lineGap: 1 });
}

function fieldHeight(doc: Pdf, label: string, value: string, width: number) {
  return (
    textHeight(doc, label, width, 7) + textHeight(doc, value, width, 9) + 8
  );
}

function field(
  doc: Pdf,
  x: number,
  y: number,
  width: number,
  label: string,
  value: unknown,
) {
  const displayValue = pdfText(value);
  doc
    .font(normalFont)
    .fontSize(7)
    .fillColor(MUTED)
    .text(label, x, y, { width });
  doc
    .font(boldFont)
    .fontSize(9)
    .fillColor(INK)
    .text(displayValue, x, y + 10, { width, lineGap: 1 });
  return fieldHeight(doc, label, displayValue, width);
}

type GridField = { label: string; value: unknown };

function gridHeight(doc: Pdf, fields: GridField[], widths: number[]) {
  return Math.max(
    ...fields.map((item, index) =>
      fieldHeight(doc, item.label, pdfText(item.value), widths[index]),
    ),
  );
}

function drawGridRow(
  doc: Pdf,
  fields: GridField[],
  widths: number[],
  y: number,
) {
  const height = gridHeight(doc, fields, widths);
  let x = LEFT;
  fields.forEach((item, index) => {
    field(doc, x, y, widths[index], item.label, item.value);
    x += widths[index] + COLUMN_GAP;
  });
  return height;
}

function tableRowHeight(doc: Pdf, values: string[], widths: number[]) {
  return Math.max(
    24,
    ...values.map((value, index) => {
      doc.font(normalFont).fontSize(8);
      return (
        doc.heightOfString(value, { width: widths[index] - 8, lineGap: 1 }) + 10
      );
    }),
  );
}

function tableRow(
  doc: Pdf,
  values: string[],
  widths: number[],
  y: number,
  height: number,
  header = false,
) {
  let x = LEFT;
  if (header)
    doc.rect(LEFT, y, RIGHT - LEFT, height).fillAndStroke(LIGHT, "#444444");
  doc.lineWidth(0.5).strokeColor(RULE);
  values.forEach((value, index) => {
    const width = widths[index];
    doc.rect(x, y, width, height).stroke();
    doc
      .font(header ? boldFont : normalFont)
      .fontSize(header ? 7.5 : 8)
      .fillColor(INK)
      .text(value, x + 4, y + 5, { width: width - 8, lineGap: 1 });
    x += width;
  });
}

function drawHeader(
  doc: Pdf,
  snapshot: ReportSnapshotData,
  reportVersion: number,
) {
  let y = 36;
  doc
    .font(boldFont)
    .fontSize(7)
    .fillColor(MUTED)
    .text("STUDENT REPORT CARD", LEFT, y, { characterSpacing: 1 });
  y += 13;

  const schoolName = pdfText(snapshot.school.name);
  doc.font(boldFont).fontSize(16).fillColor(INK);
  doc.text(schoolName, LEFT, y, { width: RIGHT - LEFT, lineGap: 1 });
  y += doc.heightOfString(schoolName, { width: RIGHT - LEFT, lineGap: 1 }) + 4;

  const schoolMeta = [
    `School code: ${pdfText(snapshot.school.school_code)}`,
    snapshot.school.motto ? `Motto: ${pdfText(snapshot.school.motto)}` : null,
    snapshot.school.address
      ? `Address: ${pdfText(snapshot.school.address)}`
      : null,
    snapshot.school.phone ? `Phone: ${pdfText(snapshot.school.phone)}` : null,
    snapshot.school.email ? `Email: ${pdfText(snapshot.school.email)}` : null,
    snapshot.school.website
      ? `Website: ${pdfText(snapshot.school.website)}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
  doc.font(normalFont).fontSize(7.5).fillColor(MUTED);
  doc.text(schoolMeta, LEFT, y, { width: RIGHT - LEFT, lineGap: 1 });
  y += doc.heightOfString(schoolMeta, { width: RIGHT - LEFT, lineGap: 1 }) + 7;

  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(INK).stroke();
  y += 12;
  const learner = pdfText(snapshot.student.display_name);
  doc.font(boldFont).fontSize(13).fillColor(INK);
  doc.text(learner, LEFT, y, { width: RIGHT - LEFT, lineGap: 1 });
  y += doc.heightOfString(learner, { width: RIGHT - LEFT, lineGap: 1 }) + 3;
  const period = `${pdfText(snapshot.academic_period.academic_year_name)} | ${pdfText(snapshot.academic_period.term_name)} | Report version ${reportVersion}`;
  doc.font(normalFont).fontSize(8).fillColor(MUTED);
  doc.text(period, LEFT, y, { width: RIGHT - LEFT, lineGap: 1 });
  y += doc.heightOfString(period, { width: RIGHT - LEFT, lineGap: 1 }) + 9;
  doc.y = y;
}

function drawSubjectTable(
  doc: Pdf,
  state: PageState,
  subjects: ReportPdfData["subjects"],
) {
  const widths = [150, 62, 62, 77, 72, RIGHT - LEFT - 423];
  const headings = [
    "Subject",
    "Score",
    "Grade",
    "Aggregate",
    "Position",
    "Status",
  ];
  const drawTableHeader = (title: string) => {
    section(doc, title);
    tableRow(doc, headings, widths, doc.y, 24, true);
    doc.y += 24;
  };

  ensureSpace(doc, state, 50);
  drawTableHeader("Subject results");
  const orderedSubjects = [...subjects].sort(
    (left, right) =>
      left.sort_order - right.sort_order ||
      left.subject_id.localeCompare(right.subject_id),
  );
  for (const subject of orderedSubjects) {
    const values = [
      pdfText(subject.subject_name),
      pdfNumber(subject.subject_score),
      pdfText(subject.grade),
      pdfNumber(subject.aggregate_points),
      pdfPosition(
        subject.subject_position,
        subject.subject_is_tied,
        subject.subject_tie_size,
      ),
      `${pdfSubjectStatus(subject.subject_status, subject.has_absence, subject.has_exemption)}${subject.subject_is_tied ? ` (tie of ${subject.subject_tie_size})` : ""}`,
    ];
    const height = tableRowHeight(doc, values, widths);
    ensureSpace(doc, state, height, () =>
      drawTableHeader("Subject results (continued)"),
    );
    tableRow(doc, values, widths, doc.y, height);
    doc.y += height;
  }
  doc.y += 12;
}

function drawLabeledParagraph(
  doc: Pdf,
  state: PageState,
  label: string,
  value: unknown,
) {
  const text = `${label}: ${pdfText(value)}`;
  const height = textHeight(doc, text, RIGHT - LEFT, 8) + 5;
  ensureSpace(doc, state, height);
  doc
    .font(normalFont)
    .fontSize(8)
    .fillColor(INK)
    .text(text, LEFT, doc.y, {
      width: RIGHT - LEFT,
      lineGap: 1,
    });
  doc.y += height;
}

function finishFooters(doc: Pdf) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    drawFooter(doc, index + 1, range.count);
  }
}

export function writeReportCardPdf(data: ReportPdfData) {
  const { report, subjects } = data;
  const snapshot = report.snapshot_data;
  const summary = snapshot.academic_summary;
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    info: {
      Author: "School report system",
      CreationDate: REPORT_PDF_FIXED_DATE,
      Creator: "School report system",
      Keywords: "student report card",
      Producer: "School report system",
      Subject: "Immutable student report card",
      Title: `Report card - ${pdfText(snapshot.student.display_name)}`,
    },
    margin: 0,
    pdfVersion: "1.7",
    size: "A4",
  });
  const state: PageState = { pageNumber: 0 };
  newPage(doc, state);
  drawHeader(doc, snapshot, report.report_version);

  const three = (RIGHT - LEFT - COLUMN_GAP * 2) / 3;
  const widths = [three, three, three];
  section(doc, "Learner and placement");
  const learnerRows: GridField[][] = [
    [
      { label: "Admission number", value: snapshot.student.admission_number },
      { label: "Grade", value: snapshot.placement.grade_name },
      { label: "Class", value: snapshot.placement.class_name },
    ],
    [
      { label: "Class code", value: snapshot.placement.class_code },
      {
        label: "Academic year",
        value: snapshot.academic_period.academic_year_name,
      },
      { label: "Term", value: snapshot.academic_period.term_name },
    ],
  ];
  for (const row of learnerRows) {
    const height = gridHeight(doc, row, widths);
    ensureSpace(doc, state, height);
    drawGridRow(doc, row, widths, doc.y);
    doc.y += height + 5;
  }
  doc.y += 7;

  section(doc, "Academic summary");
  const summaryRows: GridField[][] = [
    [
      { label: "Overall total", value: pdfNumber(summary.overall_total) },
      { label: "Overall average", value: pdfNumber(summary.overall_average) },
      { label: "Overall grade", value: summary.overall_grade },
    ],
    [
      { label: "Aggregate", value: pdfNumber(summary.aggregate_total) },
      { label: "Classification", value: summary.aggregate_classification },
      {
        label: "Status",
        value: summary.is_complete ? "Complete" : "Incomplete",
      },
    ],
    [
      {
        label: "Class position",
        value: pdfPosition(
          summary.class_position,
          summary.class_is_tied,
          summary.class_tie_size,
        ),
      },
      {
        label: "Grade-level position",
        value: pdfPosition(
          summary.grade_level_position,
          summary.grade_level_is_tied,
          summary.grade_level_tie_size,
        ),
      },
      {
        label: "Subjects complete",
        value: `${summary.complete_subject_count} of ${summary.subject_count}`,
      },
    ],
  ];
  const summaryHeight = summaryRows.reduce(
    (total, row) => total + gridHeight(doc, row, widths) + 5,
    7,
  );
  ensureSpace(doc, state, summaryHeight + 7);
  const summaryBoxY = doc.y;
  doc
    .roundedRect(LEFT, summaryBoxY, RIGHT - LEFT, summaryHeight, 2)
    .lineWidth(0.7)
    .strokeColor("#444444")
    .stroke();
  doc.y = summaryBoxY + 7;
  for (const row of summaryRows) {
    const height = drawGridRow(doc, row, widths, doc.y);
    doc.y += height + 5;
  }
  doc.y = summaryBoxY + summaryHeight + 12;

  drawSubjectTable(doc, state, subjects);

  ensureSpace(doc, state, 45);
  section(doc, "Attendance and comments");
  const attendance = snapshot.attendance;
  const half = (RIGHT - LEFT - COLUMN_GAP) / 2;
  const attendanceRows: GridField[][] = [
    [
      { label: "Days open", value: attendance?.days_open },
      { label: "Present", value: attendance?.days_present },
    ],
    [
      { label: "Absent", value: attendance?.days_absent },
      { label: "Times late", value: attendance?.times_late },
    ],
  ];
  const attendanceWidths = [half, half];
  if (!attendance) {
    ensureSpace(doc, state, 22);
    doc
      .font(normalFont)
      .fontSize(8)
      .fillColor(MUTED)
      .text("Attendance unavailable for this snapshot.", LEFT, doc.y, {
        width: RIGHT - LEFT,
      });
    doc.y += 22;
  } else {
    for (const row of attendanceRows) {
      const height = drawGridRow(doc, row, attendanceWidths, doc.y);
      doc.y += height + 5;
    }
  }
  doc.y += 4;

  const comments = snapshot.comments;
  if (!comments) {
    drawLabeledParagraph(
      doc,
      state,
      "Comments",
      "Comments unavailable for this snapshot.",
    );
  } else {
    drawLabeledParagraph(
      doc,
      state,
      "Class teacher comment",
      comments.class_teacher_comment,
    );
    drawLabeledParagraph(
      doc,
      state,
      "Head teacher comment",
      comments.head_teacher_comment,
    );
    drawLabeledParagraph(doc, state, "Conduct", comments.conduct_grade);
  }

  ensureSpace(doc, state, 48);
  section(doc, "Next term");
  drawLabeledParagraph(
    doc,
    state,
    "Next term",
    snapshot.next_term
      ? `${pdfText(snapshot.next_term.term_name)} | starts ${pdfDate(snapshot.next_term.starts_on)}`
      : "Next term information unavailable for this snapshot.",
  );

  ensureSpace(doc, state, 82);
  section(doc, "Signatories");
  const signatoryRows: GridField[] = [
    {
      label: "Class teacher",
      value: snapshot.signatories.class_teacher?.display_name,
    },
    {
      label: "Head teacher",
      value: snapshot.signatories.head_teacher?.display_name,
    },
  ];
  const signatoryHeight = drawGridRow(
    doc,
    signatoryRows,
    attendanceWidths,
    doc.y,
  );
  doc.y += signatoryHeight + 12;

  ensureSpace(doc, state, 85);
  section(doc, "Snapshot fingerprint");
  drawLabeledParagraph(
    doc,
    state,
    "Report snapshot SHA-256",
    report.snapshot_checksum,
  );
  drawLabeledParagraph(
    doc,
    state,
    "Calculation input SHA-256",
    report.input_checksum,
  );
  drawLabeledParagraph(
    doc,
    state,
    "Calculation output SHA-256",
    report.output_checksum,
  );
  drawLabeledParagraph(doc, state, "Layout", REPORT_PDF_LAYOUT_VERSION);

  finishFooters(doc);
  doc.end();
  return doc;
}
