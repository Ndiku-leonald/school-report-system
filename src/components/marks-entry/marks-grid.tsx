"use client";

import { useMemo, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveMarkEntriesAction } from "@/lib/marks-entry/actions";
import type {
  MarkCell,
  MarkComponent,
  MarkRosterItem,
} from "@/lib/marks-entry/types";

type Attendance = MarkCell["attendanceStatus"];
type DraftCell = {
  score: string;
  attendanceStatus: Attendance;
  teacherRemark: string;
  rowVersion: number | null;
};

const attendanceOptions: { value: Attendance; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "EXEMPTED", label: "Exempted" },
  { value: "NOT_ASSESSED", label: "Not assessed" },
];

function cellKey(enrollmentId: string, componentId: string) {
  return `${enrollmentId}:${componentId}`;
}

export function MarksGrid({
  markSheetId,
  components,
  roster,
  marks,
  editable,
}: {
  markSheetId: string;
  components: MarkComponent[];
  roster: MarkRosterItem[];
  marks: MarkCell[];
  editable: boolean;
}) {
  const initialCells = useMemo(() => {
    const map: Record<string, DraftCell> = {};
    for (const mark of marks) {
      map[cellKey(mark.enrollmentId, mark.componentId)] = {
        score: mark.score === null ? "" : String(mark.score),
        attendanceStatus: mark.attendanceStatus,
        teacherRemark: mark.teacherRemark ?? "",
        rowVersion: mark.rowVersion,
      };
    }
    return map;
  }, [marks]);
  const [cells, setCells] = useState<Record<string, DraftCell>>(initialCells);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<{
    kind: "success" | "warning";
    text: string;
    conflict?: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function currentCell(enrollmentId: string, componentId: string): DraftCell {
    return (
      cells[cellKey(enrollmentId, componentId)] ?? {
        score: "",
        attendanceStatus: "NOT_ASSESSED",
        teacherRemark: "",
        rowVersion: null,
      }
    );
  }

  function updateCell(
    enrollmentId: string,
    componentId: string,
    patch: Partial<DraftCell>,
  ) {
    const key = cellKey(enrollmentId, componentId);
    setCells((current) => {
      const existing = current[key] ?? {
        score: "",
        attendanceStatus: "NOT_ASSESSED",
        teacherRemark: "",
        rowVersion: null,
      };
      return { ...current, [key]: { ...existing, ...patch } };
    });
    setDirty((current) => new Set(current).add(key));
    setMessage(null);
  }

  function saveDraft() {
    const entries = Array.from(dirty).map((key) => {
      const [enrollmentId, assessmentComponentId] = key.split(":");
      const cell = cells[key];
      return {
        assessmentComponentId,
        enrollmentId,
        expectedRowVersion: cell.rowVersion,
        score: cell.score === "" ? null : Number(cell.score),
        attendanceStatus: cell.attendanceStatus,
        teacherRemark: cell.teacherRemark || null,
      };
    });
    startTransition(async () => {
      const result = await saveMarkEntriesAction({ markSheetId, entries });
      if (!result.ok) {
        setMessage({
          kind: "warning",
          text: result.message,
          conflict: result.conflict,
        });
        return;
      }
      setCells((current) => {
        const updated = { ...current };
        for (const [key, rowVersion] of Object.entries(result.versions ?? {})) {
          if (updated[key]) updated[key] = { ...updated[key], rowVersion };
        }
        return updated;
      });
      setDirty(new Set());
      setMessage({ kind: "success", text: result.message });
    });
  }

  return (
    <div className="space-y-4">
      {!editable ? (
        <Alert title="Read-only mark sheet" variant="warning">
          Only a DRAFT sheet in a MARKS_ENTRY term may be edited by its current
          assigned subject teacher.
        </Alert>
      ) : null}
      {message ? (
        <Alert
          title={message.kind === "success" ? "Draft saved" : "Draft not saved"}
          variant={message.kind}
        >
          <p>{message.text}</p>
          {message.conflict ? (
            <Button
              className="mt-3"
              onClick={() => window.location.reload()}
              size="sm"
              variant="secondary"
            >
              Reload latest values
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {dirty.size
            ? `${dirty.size} unsaved ${dirty.size === 1 ? "cell" : "cells"}`
            : "All changes saved"}
        </p>
        {editable ? (
          <Button
            disabled={!dirty.size}
            loading={isPending}
            loadingLabel="Saving draft"
            onClick={saveDraft}
          >
            Save draft
          </Button>
        ) : null}
      </div>

      <div
        className="border-border overflow-x-auto rounded-xl border"
        role="region"
        aria-label="Marks entry grid"
        tabIndex={0}
      >
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="border-border sticky left-0 z-10 min-w-56 border-b bg-inherit px-4 py-3 text-left">
                Learner
              </th>
              {components.map((component) => (
                <th
                  className="border-border min-w-64 border-b px-4 py-3 text-left"
                  key={component.componentId}
                >
                  <span className="block font-semibold">{component.name}</span>
                  <span className="text-muted-foreground font-normal">
                    {component.componentCode} · max {component.maximumScore} ·{" "}
                    {component.weightPercentage}%
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((learner) => (
              <tr
                className="border-border border-b last:border-0"
                key={learner.enrollmentId}
              >
                <th className="bg-surface border-border sticky left-0 z-10 px-4 py-3 text-left align-top">
                  <span className="block font-semibold">
                    {learner.displayName}
                  </span>
                  <span className="text-muted-foreground block font-normal">
                    {learner.classNumber ?? learner.admissionNumber} ·{" "}
                    {learner.enrollmentStatus}
                  </span>
                </th>
                {components.map((component) => {
                  const cell = currentCell(
                    learner.enrollmentId,
                    component.componentId,
                  );
                  const key = cellKey(
                    learner.enrollmentId,
                    component.componentId,
                  );
                  return (
                    <td
                      className="px-3 py-3 align-top"
                      key={component.componentId}
                    >
                      <fieldset
                        className="space-y-2"
                        disabled={!editable || isPending}
                      >
                        <legend className="sr-only">
                          {learner.displayName}, {component.name}
                        </legend>
                        <Input
                          aria-label={`${learner.displayName} ${component.name} score`}
                          data-cell-key={key}
                          inputMode="decimal"
                          max={component.maximumScore}
                          min="0"
                          onChange={(event) =>
                            updateCell(
                              learner.enrollmentId,
                              component.componentId,
                              {
                                score: event.target.value,
                                attendanceStatus:
                                  event.target.value === ""
                                    ? cell.attendanceStatus
                                    : "PRESENT",
                              },
                            )
                          }
                          placeholder={`0–${component.maximumScore}`}
                          step="0.01"
                          type="number"
                          value={cell.score}
                        />
                        <select
                          aria-label={`${learner.displayName} ${component.name} attendance`}
                          className="border-border bg-surface min-h-10 w-full rounded-lg border px-2"
                          onChange={(event) => {
                            const attendanceStatus = event.target
                              .value as Attendance;
                            updateCell(
                              learner.enrollmentId,
                              component.componentId,
                              {
                                attendanceStatus,
                                ...(attendanceStatus === "PRESENT"
                                  ? {}
                                  : { score: "" }),
                              },
                            );
                          }}
                          value={cell.attendanceStatus}
                        >
                          {attendanceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label={`${learner.displayName} ${component.name} teacher remark`}
                          maxLength={500}
                          onChange={(event) =>
                            updateCell(
                              learner.enrollmentId,
                              component.componentId,
                              {
                                teacherRemark: event.target.value,
                              },
                            )
                          }
                          placeholder="Optional remark"
                          value={cell.teacherRemark}
                        />
                        {dirty.has(key) ? (
                          <span className="text-warning-strong text-xs font-semibold">
                            Unsaved
                          </span>
                        ) : null}
                      </fieldset>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
