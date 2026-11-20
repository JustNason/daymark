"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Empty } from "@/components/Empty";
import {
  sameZonedDay,
  zonedMidnight,
  zonedPartsOf,
  zonedTime,
} from "@/lib/timezone";

type Task = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  priority: string;
};
type Event = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string;
};
type WorkSession = {
  id: string;
  task_id: string;
  starts_at: string;
  ends_at: string;
};
type Assignment = {
  id: string;
  title: string;
  personal_title?: string | null;
  original_due_at: string | null;
  personal_due_at: string | null;
  personal_completed: boolean | null;
  original_completed: boolean | null;
};
export function CalendarView({
  date,
  setDate,
  events,
  workSessions,
  tasks,
  assignments,
  timezone,
  weekStartsOn,
  loadRange,
  loading,
  addEvent,
  onSelectEvent,
  onSessionStatus,
}: {
  date: Date;
  setDate: (d: Date) => void;
  events: Event[];
  workSessions: WorkSession[];
  tasks: Task[];
  assignments: Assignment[];
  timezone: string;
  weekStartsOn: 0 | 1 | 6;
  loadRange: (from: Date, to: Date) => Promise<void>;
  loading: boolean;
  addEvent: () => void;
  onSelectEvent: (event: Event) => void;
  onSessionStatus: (id: string, status: "done" | "skipped") => void;
}) {
  const [view, setView] = useState<"Month" | "Week" | "Day" | "Agenda">("Week");
  const [now, setNow] = useState(new Date());
  const [allowExternalExplanation, setAllowExternalExplanation] =
    useState(false);
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const applyNarrowFallback = () => {
      if (media.matches)
        setView((current) => (current === "Week" ? "Agenda" : current));
    };
    applyNarrowFallback();
    media.addEventListener("change", applyNarrowFallback);
    return () => media.removeEventListener("change", applyNarrowFallback);
  }, []);
  const start = useMemo(
    () =>
      view === "Month"
        ? startOfWeek(startOfMonth(date), { weekStartsOn })
        : startOfWeek(date, { weekStartsOn }),
    [date, view, weekStartsOn],
  );
  const days =
    view === "Month"
      ? eachDayOfInterval({ start, end: addDays(start, 41) })
      : view === "Day"
        ? [date]
        : Array.from({ length: 7 }, (_, i) => addDays(start, i));
  useEffect(() => {
    const visibleStart =
      view === "Month" ? start : view === "Day" ? date : start;
    const visibleEnd =
      view === "Month"
        ? addDays(start, 42)
        : view === "Day"
          ? addDays(date, 1)
          : addDays(start, 7);
    void loadRange(
      zonedMidnight(visibleStart, timezone),
      zonedMidnight(visibleEnd, timezone),
    );
  }, [date, loadRange, start, timezone, view]);
  const entries = [
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      time: e.starts_at,
      end: e.ends_at,
      color: e.color,
      kind: "Event",
      deadline: false,
    })),
    ...workSessions.map((s) => ({
      id: s.id,
      title: tasks.find((t) => t.id === s.task_id)?.title || "Planned work",
      time: s.starts_at,
      end: s.ends_at,
      color: "var(--accent)",
      kind: "Work session",
      deadline: false,
    })),
    ...tasks
      .filter((t) => t.due_at && t.status !== "completed")
      .map((t) => ({
        id: t.id,
        title: t.title,
        time: t.due_at!,
        end: null,
        color: "var(--warning)",
        kind: "Task deadline",
        deadline: true,
      })),
  ];
  const assignmentEntries = assignments
    .filter(
      (a) =>
        (a.personal_due_at || a.original_due_at) &&
        !(a.personal_completed ?? a.original_completed),
    )
    .map((a) => ({
      id: a.id,
      title: a.personal_title || a.title,
      time: a.personal_due_at || a.original_due_at!,
      end: null,
      color: "var(--info)",
      kind: "Assignment deadline",
      deadline: true,
    }));
  const allEntries = [...entries, ...assignmentEntries];
  async function explainVisiblePlan() {
    setExplaining(true);
    setExplanation("");
    const rangeStart = zonedMidnight(days[0], timezone);
    const rangeEnd = zonedMidnight(addDays(days[days.length - 1], 1), timezone);
    try {
      const response = await fetch("/api/ai/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: "explain",
          input: {
            slots: allEntries
              .filter(
                (entry) =>
                  !entry.deadline &&
                  entry.end &&
                  new Date(entry.time) >= rangeStart &&
                  new Date(entry.time) < rangeEnd,
              )
              .map((entry) => ({
                title: entry.title,
                start: entry.time,
                end: entry.end!,
              })),
            tasks: tasks
              .filter(
                (task) =>
                  task.status !== "completed" &&
                  task.due_at &&
                  new Date(task.due_at) >= rangeStart &&
                  new Date(task.due_at) < rangeEnd,
              )
              .map((task) => ({
                title: task.title,
                dueAt: task.due_at,
                priority:
                  task.priority === "low" ||
                  task.priority === "medium" ||
                  task.priority === "high" ||
                  task.priority === "urgent"
                    ? task.priority
                    : "medium",
              })),
            allowExternalProvider: allowExternalExplanation,
          },
        }),
      });
      const result = (await response.json()) as {
        suggestion?: { text?: string };
        error?: string;
        provider?: string;
      };
      if (!response.ok || !result.suggestion?.text)
        throw new Error(result.error || "Could not explain this schedule");
      setExplanation(
        `${result.suggestion.text}${result.provider === "deterministic" ? " (Daymark’s local rules)" : " (AI-assisted)"}`,
      );
    } catch (failure) {
      setExplanation(
        failure instanceof Error
          ? failure.message
          : "Could not explain this schedule",
      );
    } finally {
      setExplaining(false);
    }
  }
  const moveDate = (direction: -1 | 1) =>
    setDate(
      view === "Month"
        ? direction > 0
          ? addMonths(date, 1)
          : subMonths(date, 1)
        : addDays(date, direction * (view === "Day" ? 1 : 7)),
    );
  return (
    <>
      <div className="page-heading calendar-heading">
        <div>
          <div className="eyebrow">YOUR TIME</div>
          <h1>Calendar</h1>
          <p>See commitments and deadlines together.</p>
        </div>
        <button className="button primary" onClick={addEvent}>
          <Plus size={15} /> Add event
        </button>
      </div>
      <div className="calendar-toolbar">
        <div className="date-nav">
          <button
            className="button subtle small-button"
            onClick={() => setDate(new Date())}
          >
            Today
          </button>
          <button className="icon-button" onClick={() => moveDate(-1)}>
            <ChevronLeft size={17} />
          </button>
          <button className="icon-button" onClick={() => moveDate(1)}>
            <ChevronRight size={17} />
          </button>
          <h2>{format(date, view === "Day" ? "MMMM d, yyyy" : "MMMM yyyy")}</h2>
        </div>
        <div className="view-switch">
          {(["Day", "Week", "Month", "Agenda"] as const).map((v) => (
            <button
              className={view === v ? "selected" : ""}
              onClick={() => setView(v)}
              key={v}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="schedule-explanation-control">
        <label>
          <input
            type="checkbox"
            checked={allowExternalExplanation}
            onChange={(event) =>
              setAllowExternalExplanation(event.target.checked)
            }
          />
          Share visible task titles, priorities, and schedule with the
          configured AI provider
        </label>
        <button
          type="button"
          className="text-button"
          disabled={explaining}
          onClick={() => void explainVisiblePlan()}
        >
          {explaining ? "Explaining…" : "Why this plan?"}
        </button>
      </div>
      {explanation && (
        <p className="muted" role="status">
          {explanation}
        </p>
      )}
      {loading && (
        <div className="calendar-loading" role="status">
          Loading this date range…
        </div>
      )}
      {view === "Agenda" ? (
        <div className="panel agenda-list">
          {allEntries
            .filter(
              (e) =>
                new Date(e.time) >=
                  zonedMidnight(
                    startOfWeek(date, { weekStartsOn }),
                    timezone,
                  ) &&
                new Date(e.time) <
                  zonedMidnight(
                    addDays(startOfWeek(date, { weekStartsOn }), 7),
                    timezone,
                  ),
            )
            .sort((a, b) => +new Date(a.time) - +new Date(b.time))
            .map((e) => (
              <div
                className="agenda-row"
                key={e.id}
                onClick={() => {
                  const selected = events.find((event) => event.id === e.id);
                  if (selected) onSelectEvent(selected);
                }}
              >
                <time>
                  {new Intl.DateTimeFormat(undefined, {
                    timeZone: timezone,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(e.time))}
                </time>
                <span style={{ background: e.color }} />
                <b>{e.title}</b>
                <small>{e.kind}</small>
                {workSessions.some((session) => session.id === e.id) && (
                  <span className="agenda-session-actions">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSessionStatus(e.id, "done");
                      }}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSessionStatus(e.id, "skipped");
                      }}
                    >
                      Skip
                    </button>
                  </span>
                )}
              </div>
            ))}
          {allEntries.length === 0 && (
            <Empty
              icon={CalendarDays}
              title="No scheduled items"
              text="Create an event or schedule task work."
            />
          )}
        </div>
      ) : view === "Month" ? (
        <div className={`calendar-grid ${view.toLowerCase()}`}>
          <div className="calendar-weekdays">
            {days.map((d) => (
              <div key={d.toISOString()}>{format(d, "EEE")}</div>
            ))}
          </div>
          <div className="calendar-cells">
            {days.map((d) => {
              const dayEntries = allEntries.filter((e) =>
                sameZonedDay(e.time, d, timezone),
              );
              return (
                <div
                  key={d.toISOString()}
                  className={`calendar-cell ${!isSameMonth(d, date) && view === "Month" ? "outside" : ""} ${isSameDay(d, new Date()) ? "is-today" : ""}`}
                  onDoubleClick={addEvent}
                >
                  <span className="cell-date">{format(d, "d")}</span>
                  {dayEntries.slice(0, view === "Month" ? 3 : 8).map((e) => (
                    <div
                      className={`calendar-item ${e.deadline ? "calendar-deadline" : ""}`}
                      key={e.id}
                      style={{ borderLeftColor: e.color }}
                      title={e.title}
                      role={
                        events.some((event) => event.id === e.id)
                          ? "button"
                          : undefined
                      }
                      tabIndex={
                        events.some((event) => event.id === e.id)
                          ? 0
                          : undefined
                      }
                      onClick={() => {
                        const selected = events.find(
                          (event) => event.id === e.id,
                        );
                        if (selected) onSelectEvent(selected);
                      }}
                    >
                      {e.deadline
                        ? "Due · "
                        : `${zonedTime(e.time, timezone)} · `}
                      {e.title}
                    </div>
                  ))}
                  {dayEntries.length > 3 && view === "Month" && (
                    <small className="muted">
                      +{dayEntries.length - 3} more
                    </small>
                  )}
                  <button className="cell-add" onClick={addEvent}>
                    <Plus size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`time-calendar ${view.toLowerCase()}`}>
          <div className="time-day-head">
            <div />
            <div>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={isSameDay(day, now) ? "is-today" : ""}
                >
                  {format(day, "EEE d")}
                </div>
              ))}
            </div>
          </div>
          <div className="time-all-day">
            <b>All day</b>
            <div>
              {days.map((day) => (
                <div key={day.toISOString()} className="all-day-items">
                  {allEntries
                    .filter(
                      (entry) =>
                        entry.deadline &&
                        sameZonedDay(entry.time, day, timezone),
                    )
                    .map((entry) => (
                      <span
                        key={entry.id}
                        title={entry.title}
                        className="deadline-chip"
                      >
                        {entry.kind}: {entry.title}
                      </span>
                    ))}
                </div>
              ))}
            </div>
          </div>
          <div className="time-scroll">
            <div className="time-axis">
              {Array.from({ length: 18 }, (_, i) => i + 6).map((hour) => (
                <div key={hour}>
                  {format(new Date(2000, 0, 1, hour), "h a")}
                </div>
              ))}
            </div>
            <div className="time-columns">
              {days.map((day) => {
                const dayStart = zonedMidnight(day, timezone);
                const dayEnd = zonedMidnight(addDays(day, 1), timezone);
                const dayEntries = allEntries
                  .filter(
                    (entry) =>
                      !entry.deadline &&
                      new Date(entry.time) < dayEnd &&
                      new Date(
                        entry.end ||
                          new Date(+new Date(entry.time) + 30 * 60_000),
                      ) > dayStart,
                  )
                  .sort((a, b) => +new Date(a.time) - +new Date(b.time));
                const lanes: number[] = [];
                const positioned = dayEntries.map((entry) => {
                  const startAt = new Date(entry.time);
                  const startParts = zonedPartsOf(startAt, timezone);
                  const startMinute =
                    startAt < dayStart
                      ? 360
                      : Math.max(360, startParts.hour * 60 + startParts.minute);
                  const endAt = new Date(
                    entry.end || new Date(+startAt + 30 * 60_000),
                  );
                  const endParts = zonedPartsOf(endAt, timezone);
                  const endMinute = Math.min(
                    1440,
                    Math.max(
                      startMinute + 24,
                      endAt >= dayEnd
                        ? 1440
                        : endParts.hour * 60 + endParts.minute,
                    ),
                  );
                  let lane = lanes.findIndex(
                    (laneEnd) => laneEnd <= startMinute,
                  );
                  if (lane < 0) lane = lanes.length;
                  lanes[lane] = endMinute;
                  return { entry, startMinute, endMinute, lane };
                });
                const laneCount = Math.max(1, lanes.length);
                const nowParts = zonedPartsOf(now, timezone);
                const showNow =
                  sameZonedDay(day, now, timezone) &&
                  nowParts.hour >= 6 &&
                  nowParts.hour < 24;
                const nowTop =
                  ((nowParts.hour * 60 + nowParts.minute - 360) / 1080) * 100;
                return (
                  <div
                    className={`time-day ${isSameDay(day, now) ? "today" : ""}`}
                    key={day.toISOString()}
                    onDoubleClick={addEvent}
                  >
                    {Array.from({ length: 18 }, (_, i) => (
                      <div
                        className="time-hour-line"
                        key={i}
                        style={{ top: `${(i / 18) * 100}%` }}
                      />
                    ))}
                    {positioned.map(
                      ({ entry, startMinute, endMinute, lane }) => (
                        <div
                          className={`time-event ${endMinute - startMinute < 40 ? "compact" : ""}`}
                          key={entry.id}
                          title={`${entry.kind}: ${entry.title}`}
                          role={
                            events.some((event) => event.id === entry.id)
                              ? "button"
                              : undefined
                          }
                          tabIndex={
                            events.some((event) => event.id === entry.id)
                              ? 0
                              : undefined
                          }
                          onClick={() => {
                            const selected = events.find(
                              (event) => event.id === entry.id,
                            );
                            if (selected) onSelectEvent(selected);
                          }}
                          style={{
                            top: `${((startMinute - 360) / 1080) * 100}%`,
                            height: `${Math.max(2.3, ((endMinute - startMinute) / 1080) * 100)}%`,
                            left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                            width: `calc(${100 / laneCount}% - 4px)`,
                            borderLeftColor: entry.color,
                          }}
                        >
                          <b>{entry.title}</b>
                          <small>
                            {zonedTime(entry.time, timezone)}–
                            {zonedTime(
                              entry.end ||
                                new Date(+new Date(entry.time) + 30 * 60_000),
                              timezone,
                            )}
                          </small>
                        </div>
                      ),
                    )}
                    {showNow && (
                      <div
                        className="current-time-line"
                        style={{ top: `${nowTop}%` }}
                      >
                        <i />
                        {format(now, "h:mm a")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
