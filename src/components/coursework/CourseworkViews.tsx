"use client";

import { useState } from "react";
import { format } from "date-fns";
import { BookOpen } from "lucide-react";
import { Empty } from "@/components/Empty";
import { createClient } from "@/lib/supabase/client";
import { wallTimeToUtc, zonedInputValue } from "@/lib/timezone";

type Course = {
  id: string;
  name: string;
  selected: boolean;
  auto_import: boolean;
  external_id: string | null;
  section_external_id: string | null;
};
type Assignment = {
  id: string;
  title: string;
  description: string;
  personal_title?: string | null;
  personal_description?: string | null;
  original_due_at: string | null;
  personal_due_at: string | null;
  personal_completed: boolean | null;
  original_completed: boolean | null;
  course_id: string | null;
  url: string | null;
  ignored_at?: string | null;
};
type IntegrationState = {
  provider: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};
export function AssignmentRow({
  assignment: a,
  course,
  imported,
  importTask,
  onError,
  onRefresh,
  timezone,
  ignored,
}: {
  assignment: Assignment;
  course: string;
  imported: boolean;
  importTask: () => void;
  onError: (s: string) => void;
  onRefresh: () => Promise<void>;
  timezone: string;
  ignored: boolean;
}) {
  const [due, setDue] = useState(
    a.personal_due_at ? zonedInputValue(a.personal_due_at, timezone) : "",
  );
  const [saving, setSaving] = useState(false);
  async function persist(value: string | null) {
    const c = createClient();
    if (!c) return;
    const dueInstant = value ? wallTimeToUtc(value, timezone) : null;
    if (dueInstant && !Number.isFinite(dueInstant.getTime())) {
      onError(
        "That time does not exist in your timezone because the clock changes. Choose another time.",
      );
      setDue(
        a.personal_due_at ? zonedInputValue(a.personal_due_at, timezone) : "",
      );
      return;
    }
    setSaving(true);
    const result = await c
      .from("assignments")
      .update({
        personal_due_at: dueInstant?.toISOString() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    setSaving(false);
    if (result.error) onError(result.error.message);
  }
  async function setCompleted(completed: boolean) {
    const c = createClient();
    if (!c) return;
    setSaving(true);
    const { error } = await c
      .from("assignments")
      .update({
        personal_completed: completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    setSaving(false);
    if (error) onError(error.message);
    else await onRefresh();
  }
  async function setIgnored(nextIgnored: boolean) {
    const c = createClient();
    if (!c) return;
    setSaving(true);
    const { error } = await c
      .from("assignments")
      .update({
        ignored_at: nextIgnored ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    setSaving(false);
    if (error) onError(error.message);
    else await onRefresh();
  }
  return (
    <tr>
      <td>
        <b>{a.personal_title || a.title}</b>
        <small>{a.personal_description || a.description}</small>
      </td>
      <td>{course}</td>
      <td>
        {a.original_due_at
          ? format(new Date(a.original_due_at), "MMM d, yyyy")
          : "—"}
        <small>Schoology source</small>
      </td>
      <td>
        <input
          className="inline-date"
          aria-label={`Personal deadline for ${a.title}`}
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onBlur={() => persist(due || null)}
        />
        {saving && <small>Saving…</small>}
        <small>
          {a.personal_due_at ? "Personal override" : "Using Schoology date"}
        </small>
        {a.personal_due_at && (
          <button
            className="text-button reset-deadline"
            onClick={() => {
              setDue("");
              persist(null);
            }}
          >
            Revert
          </button>
        )}
      </td>
      <td>
        {(a.personal_completed ?? a.original_completed) ? (
          <button
            className="state complete"
            disabled={saving}
            onClick={() => void setCompleted(false)}
            aria-label={`Mark ${a.title} incomplete`}
          >
            Completed · Reopen
          </button>
        ) : (
          <button
            className="state pending"
            disabled={saving}
            onClick={() => void setCompleted(true)}
            aria-label={`Mark ${a.title} complete`}
          >
            Upcoming · Complete
          </button>
        )}
      </td>
      <td>
        {imported ? (
          <span className="state complete">In tasks</span>
        ) : (
          <button className="button subtle small-button" onClick={importTask}>
            Import task
          </button>
        )}
      </td>
      <td>
        <button
          className="text-button"
          disabled={saving}
          onClick={() => void setIgnored(!ignored)}
          aria-label={`${ignored ? "Restore" : "Ignore"} ${a.title}`}
        >
          {ignored ? "Restore" : "Ignore"}
        </button>
      </td>
    </tr>
  );
}
export function CoursesView({
  courses,
  integration,
  onRefresh,
  error,
  onSettings,
}: {
  courses: Course[];
  integration: IntegrationState | null;
  onRefresh: () => Promise<void>;
  error: (s: string) => void;
  onSettings: () => void;
}) {
  const connected = integration?.status === "connected";
  async function toggle(course: Course, key: "selected" | "auto_import") {
    const c = createClient();
    if (!c) return;
    const result = await c
      .from("courses")
      .update({ [key]: !course[key], updated_at: new Date().toISOString() })
      .eq("id", course.id);
    if (result.error) error(result.error.message);
    else await onRefresh();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACADEMICS</div>
          <h1>Courses</h1>
          <p>Choose which classes Daymark should keep in sync.</p>
        </div>
        <div className="heading-actions">
          {!connected && (
            <button
              type="button"
              className="button primary"
              onClick={onSettings}
            >
              Set up extension
            </button>
          )}
        </div>
      </div>
      <div
        className={`notice page-notice ${integration?.last_error ? "error" : connected ? "success" : "neutral"}`}
      >
        <b>{connected ? "Schoology connected" : "Schoology not connected"}</b>
        <span>
          {integration?.last_error ||
            (integration?.last_synced_at
              ? `Last successful sync ${format(new Date(integration.last_synced_at), "MMM d, yyyy · h:mm a")}`
              : "No successful sync recorded")}
        </span>
      </div>
      {courses.length === 0 ? (
        <Empty
          icon={BookOpen}
          title={
            connected
              ? "No courses synced yet"
              : "Connect the Daymark extension"
          }
          text={
            connected
              ? "Open Schoology, scan your courses in the Daymark extension, and sync them here."
              : "Pair the Daymark browser extension in Settings, then scan Schoology from an authenticated browser tab."
          }
          action="Open setup"
          onAction={onSettings}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Course section</th>
                  <th>Sync course</th>
                  <th>Auto import assignments</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      <small>Section {c.section_external_id || "—"}</small>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggle(c, "selected")}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={c.auto_import}
                        onChange={() => toggle(c, "auto_import")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Course and assignment scans are started from the Daymark browser
            extension.
          </p>
        </>
      )}
    </>
  );
}
