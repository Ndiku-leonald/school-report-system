import { join } from "node:path";

import PDFDocument from "pdfkit";

import type { ReportSnapshotData } from "@/lib/report-snapshots/types";

import { pdfDate, pdfNumber, pdfSubjectStatus, pdfText } from "./format";
import type { ReportPdfData } from "./types";

export const REPORT_PDF_LAYOUT_VERSION = "report-card-a4-v1";
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
const BOTTOM = PAGE_HEIGHT - 48;
const INK = "#111111";
const MUTED = "#4b4b4b";
const RULE = "#777777";
const LIGHT = "#eeeeee";

type Pdf = InstanceType<typeof PDFDocument>;

function drawFooter(doc: Pdf, pageNumber: number) {
  doc
    .font(normalFont)
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      `PDF available to authorized staff. Publication and parent access are unavailable. | Page ${pageNumber} | Layout ${REPORT_PDF_LAYOUT_VERSION}`,
      LEFT,
      PAGE_HEIGHT - 29,
      { align: "center", width: RIGHT - LEFT, lineBreak: false },
    );
}

function newPage(doc: Pdf, pageNumber: number) {
  doc.addPage({ size: "A4", margin: 0 });
  drawFooter(doc, pageNumber);
  doc.x = LEFT;
  doc.y = 36;
}

function section(doc: Pdf, title: string) {
  doc
    .font(boldFont)
    .fontSize(10)
    .fillColor(INK)
    .text(title, LEFT, doc.y, { width: RIGHT - LEFT });
  doc
    .moveTo(LEFT, doc.y + 3)
    .lineTo(RIGHT, doc.y + 3)
    .lineWidth(0.7)
    .strokeColor(RULE)
    .stroke();
  doc.y += 11;
}

function field(
  doc: Pdf,
  x: number,
  y: number,
  width: number,
  label: string,
  value: unknown,
) {
  doc
    .font(normalFont)
    .fontSize(7)
    .fillColor(MUTED)
    .text(label, x, y, { width });
  doc
    .font(boldFont)
    .fontSize(9)
    .fillColor(INK)
    .text(pdfText(value), x, y + 10, {
      width,
      height: 22,
      ellipsis: true,
    });
}

function row(
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
      .text(value, x + 4, y + 5, {
        width: width - 8,
        height: height - 7,
        ellipsis: true,
      });
    x += width;
  });
}

function header(doc: Pdf, snapshot: ReportSnapshotData, reportVersion: number) {
  doc
    .font(boldFont)
    .fontSize(7)
    .fillColor(MUTED)
    .text("STUDENT REPORT CARD", LEFT, 36, {
      characterSpacing: 1,
    });
  doc
    .font(boldFont)
    .fontSize(17)
    .fillColor(INK)
    .text(pdfText(snapshot.school.name), LEFT, 49);
  doc
    .font(normalFont)
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      `${pdfText(snapshot.school.school_code)}${snapshot.school.address ? ` | ${pdfText(snapshot.school.address)}` : ""}`,
      LEFT,
      70,
    );
  doc
    .moveTo(LEFT, 88)
    .lineTo(RIGHT, 88)
    .lineWidth(1.5)
    .strokeColor(INK)
    .stroke();
  doc
    .font(boldFont)
    .fontSize(13)
    .fillColor(INK)
    .text(pdfText(snapshot.student.display_name), LEFT, 101);
  doc
    .font(normalFont)
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      `${pdfText(snapshot.academic_period.academic_year_name)} | ${pdfText(snapshot.academic_period.term_name)} | Report version ${reportVersion}`,
      LEFT,
      119,
    );
  doc.y = 143;
}

export function writeReportCardPdf(data: ReportPdfData) {
  const { report, subjects } = data;
  const snapshot = report.snapshot_data;
  const summary = snapshot.academic_summary;
  const orderedSubjects = [...subjects].sort(
    (left, right) =>
      left.sort_order - right.sort_order ||
      left.subject_id.localeCompare(right.subject_id),
  );
  const doc = new PDFDocument({
    autoFirstPage: false,
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
  let pageNumber = 1;
  newPage(doc, pageNumber);
  header(doc, snapshot, report.report_version);

  section(doc, "Learner and placement");
  const three = (RIGHT - LEFT - 14) / 3;
  let y = doc.y;
  field(
    doc,
    LEFT,
    y,
    three,
    "Admission number",
    snapshot.student.admission_number,
  );
  field(doc, LEFT + three + 7, y, three, "Gender", snapshot.student.gender);
  field(
    doc,
    LEFT + (three + 7) * 2,
    y,
    three,
    "Date of birth",
    pdfDate(snapshot.student.date_of_birth),
  );
  y += 39;
  field(doc, LEFT, y, three, "Grade", snapshot.placement.grade_name);
  field(
    doc,
    LEFT + three + 7,
    y,
    three,
    "Class",
    snapshot.placement.class_name,
  );
  field(
    doc,
    LEFT + (three + 7) * 2,
    y,
    three,
    "Class code",
    snapshot.placement.class_code,
  );
  doc.y = y + 36;

  section(doc, "Academic summary");
  doc
    .roundedRect(LEFT, doc.y, RIGHT - LEFT, 65, 2)
    .lineWidth(0.7)
    .strokeColor("#444444")
    .stroke();
  y = doc.y + 9;
  field(
    doc,
    LEFT + 8,
    y,
    three - 8,
    "Overall total",
    pdfNumber(summary.overall_total),
  );
  field(
    doc,
    LEFT + three + 7,
    y,
    three,
    "Overall average",
    pdfNumber(summary.overall_average),
  );
  field(
    doc,
    LEFT + (three + 7) * 2,
    y,
    three - 8,
    "Overall grade",
    summary.overall_grade,
  );
  y += 38;
  field(
    doc,
    LEFT + 8,
    y,
    three - 8,
    "Aggregate",
    pdfNumber(summary.aggregate_total),
  );
  field(
    doc,
    LEFT + three + 7,
    y,
    three,
    "Classification",
    summary.aggregate_classification,
  );
  field(
    doc,
    LEFT + (three + 7) * 2,
    y,
    three - 8,
    "Status",
    summary.is_complete ? "Complete" : "Incomplete",
  );
  doc.y += 77;

  section(doc, "Subject results");
  const widths = [150, 62, 62, 77, 72, RIGHT - LEFT - 423];
  const headings = [
    "Subject",
    "Score",
    "Grade",
    "Aggregate",
    "Position",
    "Status",
  ];
  row(doc, headings, widths, doc.y, 22, true);
  y = doc.y + 22;
  for (const subject of orderedSubjects) {
    if (y > BOTTOM - 28) {
      pageNumber += 1;
      newPage(doc, pageNumber);
      section(doc, "Subject results (continued)");
      row(doc, headings, widths, doc.y, 22, true);
      y = doc.y + 22;
    }
    row(
      doc,
      [
        pdfText(subject.subject_name),
        pdfNumber(subject.subject_score),
        pdfText(subject.grade),
        pdfNumber(subject.aggregate_points),
        pdfNumber(subject.subject_position),
        `${pdfSubjectStatus(subject.subject_status, subject.has_absence, subject.has_exemption)}${subject.subject_is_tied ? " (tied)" : ""}`,
      ],
      widths,
      y,
      22,
    );
    y += 22;
  }
  doc.y = y + 13;

  if (doc.y > 520) {
    pageNumber += 1;
    newPage(doc, pageNumber);
  }
  section(doc, "Attendance and comments");
  const half = (RIGHT - LEFT - 12) / 2;
  const attendance = snapshot.attendance;
  const comments = snapshot.comments;
  field(doc, LEFT, doc.y, half, "Days open", attendance?.days_open);
  field(doc, LEFT, doc.y + 30, half, "Present", attendance?.days_present);
  field(doc, LEFT + half + 12, doc.y, half, "Absent", attendance?.days_absent);
  field(
    doc,
    LEFT + half + 12,
    doc.y + 30,
    half,
    "Times late",
    attendance?.times_late,
  );
  if (!attendance)
    doc
      .font(normalFont)
      .fontSize(8)
      .fillColor(MUTED)
      .text("Attendance unavailable for this snapshot.", LEFT, doc.y + 15);
  const commentY = doc.y + 68;
  doc
    .font(normalFont)
    .fontSize(8)
    .fillColor(INK)
    .text(
      `Class teacher: ${pdfText(comments?.class_teacher_comment)}`,
      LEFT + half + 12,
      commentY,
      { width: half },
    );
  doc
    .font(normalFont)
    .fontSize(8)
    .fillColor(INK)
    .text(
      `Head teacher: ${pdfText(comments?.head_teacher_comment)}`,
      LEFT + half + 12,
      commentY + 17,
      { width: half },
    );
  doc
    .font(normalFont)
    .fontSize(8)
    .fillColor(INK)
    .text(
      `Conduct: ${pdfText(comments?.conduct_grade)}`,
      LEFT + half + 12,
      commentY + 34,
      { width: half },
    );
  if (!comments)
    doc
      .font(normalFont)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        "Comments unavailable for this snapshot.",
        LEFT + half + 12,
        commentY,
        { width: half },
      );
  doc.y = commentY + 52;

  section(doc, "Next term");
  doc
    .font(normalFont)
    .fontSize(8.5)
    .fillColor(INK)
    .text(
      snapshot.next_term
        ? `${pdfText(snapshot.next_term.term_name)} | starts ${pdfDate(snapshot.next_term.starts_on)}`
        : "Next term information unavailable for this snapshot.",
      LEFT,
      doc.y,
      { width: RIGHT - LEFT },
    );
  doc.y += 27;

  section(doc, "Signatories");
  const signY = doc.y;
  doc
    .moveTo(LEFT, signY + 25)
    .lineTo(LEFT + half - 10, signY + 25)
    .strokeColor(RULE)
    .stroke();
  doc
    .moveTo(LEFT + half + 12, signY + 25)
    .lineTo(RIGHT, signY + 25)
    .strokeColor(RULE)
    .stroke();
  field(
    doc,
    LEFT,
    signY + 30,
    half - 10,
    "Class teacher",
    snapshot.signatories.class_teacher?.display_name,
  );
  field(
    doc,
    LEFT + half + 12,
    signY + 30,
    half - 12,
    "Head teacher",
    snapshot.signatories.head_teacher?.display_name,
  );
  doc.y = signY + 68;

  section(doc, "Snapshot fingerprint");
  doc
    .font(normalFont)
    .fontSize(7.5)
    .fillColor(INK)
    .text(
      `Report snapshot SHA-256: ${pdfText(report.snapshot_checksum)}`,
      LEFT,
      doc.y,
    );
  doc.text(
    `Calculation input SHA-256: ${pdfText(report.input_checksum)}`,
    LEFT,
    doc.y + 13,
  );
  doc.text(`Layout: ${REPORT_PDF_LAYOUT_VERSION}`, LEFT, doc.y + 26);
  doc.end();
  return doc;
}
