"use client";

import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { IconButton } from "@/components/IconButton";
import { createClient } from "@/lib/supabase/client";
import { wallTimeToUtc, zonedInputValue } from "@/lib/timezone";

type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_at: string | null;
  estimated_minutes: number | null;
  project_id: string | null;
  assignment_id?: string | null;
  created_at: string;
};
type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  target_date: string | null;
  updated_at?: string;
};
const statuses = ["backlog", "todo", "in_progress", "in_review", "completed"];
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export function TaskDetailModal({
  task,
  projects,
  supabase,
  timezone,
  courseworkContext,
  userId,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
}: {
  task: Task;
  projects: Project[];
  supabase: NonNullable<ReturnType<typeof createClient>>;
  timezone: string;
  courseworkContext: { courseName?: string; dueAt?: string | null } | null;
  userId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Task>) => Promise<void>;
  onDuplicate: (task: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [due, setDue] = useState(
    task.due_at ? zonedInputValue(task.due_at, timezone) : "",
  );
  const [minutes, setMinutes] = useState(
    task.estimated_minutes?.toString() || "",
  );
  const [projectId, setProjectId] = useState(task.project_id || "");
  const [busy, setBusy] = useState(false);
  const [subtasks, setSubtasks] = useState<
    { id: string; title: string; is_completed: boolean }[]
  >([]);
  const [comments, setComments] = useState<
    { id: string; body: string; created_at: string }[]
  >([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [comment, setComment] = useState("");
  const [breakdownSuggestions, setBreakdownSuggestions] = useState<
    { title: string; accepted: boolean }[]
  >([]);
  const [breakdownBusy, setBreakdownBusy] = useState(false);
  const [breakdownConsent, setBreakdownConsent] = useState(false);
  const [breakdownMessage, setBreakdownMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function loadDetails() {
      const [subtaskResult, commentResult] = await Promise.all([
        supabase
          .from("subtasks")
          .select("id,title,is_completed")
          .eq("task_id", task.id)
          .order("position"),
        supabase
          .from("task_comments")
          .select("id,body,created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (!subtaskResult.error) setSubtasks(subtaskResult.data || []);
      if (!commentResult.error) setComments(commentResult.data || []);
    }
    void loadDetails();
    return () => {
      active = false;
    };
  }, [supabase, task.id]);
  async function addSubtask() {
    const value = subtaskTitle.trim();
    if (!value) return;
    const result = await supabase
      .from("subtasks")
      .insert({
        user_id: userId,
        task_id: task.id,
        title: value,
        position: subtasks.length,
      })
      .select("id,title,is_completed")
      .single();
    if (!result.error) {
      setSubtasks((items) => [...items, result.data]);
      setSubtaskTitle("");
    }
  }
  async function toggleSubtask(item: (typeof subtasks)[number]) {
    const result = await supabase
      .from("subtasks")
      .update({ is_completed: !item.is_completed })
      .eq("id", item.id);
    if (!result.error)
      setSubtasks((items) =>
        items.map((entry) =>
          entry.id === item.id
            ? { ...entry, is_completed: !entry.is_completed }
            : entry,
        ),
      );
  }
  async function addComment() {
    const value = comment.trim();
    if (!value) return;
    const result = await supabase
      .from("task_comments")
      .insert({ user_id: userId, task_id: task.id, body: value })
      .select("id,body,created_at")
      .single();
    if (!result.error) {
      setComments((items) => [result.data, ...items]);
      setComment("");
    }
  }
  async function suggestBreakdown() {
    setBreakdownBusy(true);
    setBreakdownMessage("");
    try {
      const response = await fetch("/api/ai/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: courseworkContext ? "coursework_steps" : "breakdown",
          input: {
            title,
            description,
            ...(courseworkContext || {}),
            allowExternalProvider: breakdownConsent,
          },
        }),
      });
      const result = (await response.json()) as {
        provider?: string;
        suggestion?: { steps?: string[] };
        error?: string;
      };
      if (!response.ok || !result.suggestion?.steps)
        throw new Error(result.error || "Could not suggest task steps");
      setBreakdownSuggestions(
        result.suggestion.steps.map((step) => ({
          title: step,
          accepted: true,
        })),
      );
      setBreakdownMessage(
        result.provider === "deterministic"
          ? "Suggested using local rules. Review, edit, or remove steps before adding them."
          : "Suggested with the configured provider. Review, edit, or remove steps before adding them.",
      );
    } catch (failure) {
      setBreakdownMessage(
        failure instanceof Error
          ? failure.message
          : "Could not suggest task steps",
      );
    } finally {
      setBreakdownBusy(false);
    }
  }
  async function acceptBreakdown() {
    const accepted = breakdownSuggestions.filter(
      (step) => step.accepted && step.title.trim(),
    );
    if (!accepted.length) return;
    const result = await supabase
      .from("subtasks")
      .insert(
        accepted.map((step, index) => ({
          user_id: userId,
          task_id: task.id,
          title: step.title.trim(),
          position: subtasks.length + index,
        })),
      )
      .select("id,title,is_completed");
    if (result.error)
      setBreakdownMessage(
        "Could not add those steps. Your task was not changed.",
      );
    else {
      setSubtasks((items) => [...items, ...(result.data || [])]);
      setBreakdownSuggestions([]);
      setBreakdownMessage("Selected steps added to the checklist.");
    }
  }
  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    await onSave(task.id, {
      title: title.trim(),
      description,
      status,
      priority,
      due_at: due ? wallTimeToUtc(due, timezone).toISOString() : null,
      estimated_minutes: minutes ? Number(minutes) : null,
      project_id: projectId || null,
    });
    setBusy(false);
  }
  return (
    <Modal titleId="task-dialog-title" onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow">TASK DETAILS</div>
            <h2 id="task-dialog-title">Edit task</h2>
          </div>
          <IconButton
            label="Close task details"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </div>
        <label>
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {["low", "medium", "high", "urgent"].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Due date
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label>
            Estimate (minutes)
            <input
              type="number"
              min="5"
              step="5"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
        </div>
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <section className="detail-section">
          <div className="section-heading">
            <h3>Checklist</h3>
            <span className="muted">
              {subtasks.filter((item) => item.is_completed).length}/
              {subtasks.length}
            </span>
          </div>
          <div className="task-breakdown">
            {courseworkContext && (
              <b>
                Coursework steps
                {courseworkContext.courseName
                  ? ` · ${courseworkContext.courseName}`
                  : ""}
              </b>
            )}
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={breakdownConsent}
                onChange={(event) => setBreakdownConsent(event.target.checked)}
              />
              Allow the configured AI provider to receive this task
              {courseworkContext
                ? " and its course name and due date"
                : "’s title and description"}
              . Leave unchecked to use local rules.
            </label>
            <button
              type="button"
              className="button subtle small-button"
              disabled={breakdownBusy}
              onClick={() => void suggestBreakdown()}
            >
              {breakdownBusy
                ? "Suggesting…"
                : courseworkContext
                  ? "Suggest coursework steps"
                  : "Suggest steps"}
            </button>
            {breakdownMessage && (
              <p role="status" className="muted">
                {breakdownMessage}
              </p>
            )}
            {breakdownSuggestions.map((step, index) => (
              <label className="suggested-step" key={`${index}-${step.title}`}>
                <input
                  type="checkbox"
                  checked={step.accepted}
                  onChange={(event) =>
                    setBreakdownSuggestions((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, accepted: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Edit suggested step ${index + 1}`}
                  value={step.title}
                  onChange={(event) =>
                    setBreakdownSuggestions((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
            {breakdownSuggestions.length > 0 && (
              <button
                type="button"
                className="button primary small-button"
                onClick={() => void acceptBreakdown()}
              >
                Add selected steps
              </button>
            )}
          </div>
          {subtasks.map((item) => (
            <label className="checklist-row" key={item.id}>
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={() => void toggleSubtask(item)}
              />
              <span className={item.is_completed ? "completed-text" : ""}>
                {item.title}
              </span>
            </label>
          ))}
          <div className="inline-add">
            <input
              aria-label="New checklist item"
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              placeholder="Add checklist item"
            />
            <button
              className="button subtle small-button"
              type="button"
              onClick={() => void addSubtask()}
            >
              Add
            </button>
          </div>
        </section>
        <section className="detail-section">
          <div className="section-heading">
            <h3>Notes</h3>
            <span className="muted">{comments.length}</span>
          </div>
          <div className="inline-add">
            <input
              aria-label="Task note"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note"
            />
            <button
              className="button subtle small-button"
              type="button"
              onClick={() => void addComment()}
            >
              Post
            </button>
          </div>
          {comments.map((entry) => (
            <article className="comment-row" key={entry.id}>
              <p>{entry.body}</p>
              <time>{format(new Date(entry.created_at), "MMM d, h:mm a")}</time>
            </article>
          ))}
        </section>
        <div className="modal-actions task-detail-actions">
          <button
            className="button danger-outline small-button"
            type="button"
            onClick={() => onDelete(task.id)}
          >
            Delete
          </button>
          <button
            className="button subtle small-button"
            type="button"
            onClick={() => onDuplicate(task)}
          >
            Duplicate
          </button>
          <span />
          <button className="button subtle" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function CreateModal({
  kind,
  close,
  projects,
  saveTask,
  saved,
  supabase,
  timezone,
  toast,
  error,
}: {
  kind: "task" | "event" | "project";
  close: () => void;
  projects: Project[];
  saveTask: (title: string, extra: Partial<Task>) => Promise<boolean>;
  saved: () => Promise<void>;
  supabase: ReturnType<typeof createClient>;
  timezone: string;
  toast: (s: string) => void;
  error: (s: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");
  const [estimate, setEstimate] = useState("");
  const [project, setProject] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [quickAddText, setQuickAddText] = useState("");
  const [allowExternalProvider, setAllowExternalProvider] = useState(false);
  const [assistanceBusy, setAssistanceBusy] = useState(false);
  const [assistanceMessage, setAssistanceMessage] = useState("");
  async function suggestTaskFields() {
    if (!quickAddText.trim()) return;
    setAssistanceBusy(true);
    setAssistanceMessage("");
    try {
      const response = await fetch("/api/ai/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: "quick_add",
          input: { text: quickAddText.trim(), timezone, allowExternalProvider },
        }),
      });
      const result = (await response.json()) as {
        configured?: boolean;
        provider?: string;
        suggestion?: {
          title?: string;
          description?: string;
          dueAt?: string | null;
          priority?: string;
          estimatedMinutes?: number | null;
        };
        error?: string;
      };
      if (!response.ok || !result.suggestion)
        throw new Error(result.error || "Could not suggest task details");
      const suggested = result.suggestion;
      if (suggested.title) setTitle(suggested.title);
      if (suggested.description !== undefined)
        setDescription(suggested.description);
      if (suggested.dueAt) setDue(zonedInputValue(suggested.dueAt, timezone));
      else if (suggested.dueAt === null) setDue("");
      if (
        suggested.priority &&
        ["low", "medium", "high", "urgent"].includes(suggested.priority)
      )
        setPriority(suggested.priority);
      if (suggested.estimatedMinutes)
        setEstimate(String(suggested.estimatedMinutes));
      setAssistanceMessage(
        result.provider === "deterministic"
          ? "Suggested using local rules. Review the fields before creating the task."
          : "Suggested with the configured provider. Review the fields before creating the task.",
      );
    } catch (failure) {
      setAssistanceMessage(
        failure instanceof Error
          ? failure.message
          : "Could not suggest task details",
      );
    } finally {
      setAssistanceBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (!title.trim()) {
      setBusy(false);
      return;
    }
    if (kind === "task") {
      if (due && !Number.isFinite(wallTimeToUtc(due, timezone).getTime())) {
        error(
          "That time does not exist in your timezone because the clock changes. Choose another time.",
        );
        setBusy(false);
        return;
      }
      const success = await saveTask(title.trim(), {
        description,
        priority,
        due_at: due ? wallTimeToUtc(due, timezone).toISOString() : null,
        project_id: project || null,
        estimated_minutes: estimate ? Number(estimate) : null,
        status: "todo",
      });
      if (!success) {
        setBusy(false);
        return;
      }
      close();
    } else if (kind === "event") {
      if (!supabase) {
        setBusy(false);
        return;
      }
      const a = start ? wallTimeToUtc(start, timezone) : new Date(NaN),
        b = end ? wallTimeToUtc(end, timezone) : new Date(NaN);
      if (
        !start ||
        !end ||
        !Number.isFinite(a.getTime()) ||
        !Number.isFinite(b.getTime()) ||
        b <= a
      ) {
        error("Choose a valid start and end time in your timezone.");
        setBusy(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await supabase
        .from("calendar_events")
        .insert({
          user_id: user?.id,
          title,
          description,
          starts_at: a.toISOString(),
          ends_at: b.toISOString(),
          timezone,
        })
        .select()
        .single();
      if (result.error) {
        error(result.error.message);
        setBusy(false);
        return;
      } else {
        toast("Event scheduled");
        await saved();
      }
      close();
    } else {
      if (!supabase) {
        setBusy(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await supabase
        .from("projects")
        .insert({
          user_id: user?.id,
          name: title,
          description,
          color: "#8bae96",
        })
        .select()
        .single();
      if (result.error) {
        error(result.error.message);
        setBusy(false);
        return;
      } else {
        toast("Project created");
        await saved();
      }
      close();
    }
    setBusy(false);
  }
  return (
    <Modal titleId="create-dialog-title" onClose={close}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {kind === "task"
                ? "GET IT MOVING"
                : kind === "event"
                  ? "MAKE TIME"
                  : "GIVE IT A HOME"}
            </div>
            <h2 id="create-dialog-title">
              {kind === "task"
                ? "Create a task"
                : kind === "event"
                  ? "Schedule an event"
                  : "Create a project"}
            </h2>
          </div>
          <IconButton label="Close dialog" type="button" onClick={close}>
            <X size={17} />
          </IconButton>
        </div>
        <label>
          {kind === "project" ? "Project name" : "Title"}
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "task"
                ? "What needs to get done?"
                : kind === "event"
                  ? "What’s happening?"
                  : "A name for this project"
            }
          />
        </label>
        {kind === "task" && (
          <section className="quick-add-assist">
            <label htmlFor="quick-add-description">
              Describe the task in your words
            </label>
            <textarea
              id="quick-add-description"
              rows={2}
              value={quickAddText}
              onChange={(event) => setQuickAddText(event.target.value)}
              placeholder="Finish the chemistry lab report Thursday at 5 PM, high priority."
            />
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={allowExternalProvider}
                onChange={(event) =>
                  setAllowExternalProvider(event.target.checked)
                }
              />
              Allow the configured AI provider to receive this description.
              Leave unchecked to use local rules.
            </label>
            <button
              type="button"
              className="button subtle small-button"
              disabled={assistanceBusy || !quickAddText.trim()}
              onClick={() => void suggestTaskFields()}
            >
              {assistanceBusy ? "Suggesting…" : "Suggest task fields"}
            </button>
            {assistanceMessage && (
              <p role="status" className="muted">
                {assistanceMessage}
              </p>
            )}
          </section>
        )}
        {kind !== "task" && (
          <label>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add some context…"
            />
          </label>
        )}
        {kind === "task" && (
          <details className="task-advanced">
            <summary>Task details</summary>
            <label>
              Description
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add some context…"
              />
            </label>
            <div className="form-row">
              <label>
                Priority
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {["low", "medium", "high", "urgent"].map((x) => (
                    <option key={x} value={x}>
                      {label(x)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            </div>
            <label>
              Project
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estimated duration (minutes)
              <input
                type="number"
                min="5"
                step="5"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="60"
              />
            </label>
          </details>
        )}
        {kind === "event" && (
          <div className="form-row">
            <label>
              Starts
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button className="button subtle" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : kind === "task"
                ? "Create task"
                : kind === "event"
                  ? "Save event"
                  : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
