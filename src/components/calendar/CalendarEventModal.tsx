"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import { wallTimeToUtc, zonedInputValue } from "@/lib/timezone";

type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
};

export function CalendarEventModal({
  event,
  timezone,
  onClose,
  onSaved,
}: {
  event: CalendarEvent;
  timezone: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || "");
  const [start, setStart] = useState(
    zonedInputValue(event.starts_at, timezone),
  );
  const [end, setEnd] = useState(zonedInputValue(event.ends_at, timezone));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const startAt = wallTimeToUtc(start, timezone);
    const endAt = wallTimeToUtc(end, timezone);
    if (
      !title.trim() ||
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt
    ) {
      setError("Enter a title and a valid end time after the start time.");
      return;
    }
    const client = createClient();
    if (!client) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await client
      .from("calendar_events")
      .update({
        title: title.trim(),
        description,
        starts_at: startAt.toISOString(),
        ends_at: endAt.toISOString(),
        timezone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await onSaved("Event updated");
  }

  async function remove() {
    const client = createClient();
    if (!client) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const { error: deleteError } = await client
      .from("calendar_events")
      .delete()
      .eq("id", event.id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await onSaved("Event deleted");
  }

  return (
    <Modal titleId="calendar-event-title" onClose={onClose}>
      <section className="modal" aria-describedby="calendar-event-help">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">CALENDAR EVENT</div>
            <h2 id="calendar-event-title">Edit event</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close event editor"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p id="calendar-event-help" className="muted">
          Times use your Daymark timezone ({timezone}).
        </p>
        <label>
          Title
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
          />
        </label>
        <div className="form-row">
          <label>
            Starts
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Ends
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {confirmDelete ? (
            <>
              <span>Delete this event?</span>
              <button
                className="button danger-outline"
                disabled={busy}
                onClick={() => void remove()}
              >
                Confirm delete
              </button>
              <button
                className="button subtle"
                onClick={() => setConfirmDelete(false)}
              >
                Keep event
              </button>
            </>
          ) : (
            <button
              className="button danger-outline"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
          <span />
          <button className="button subtle" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save event"}
          </button>
        </div>
      </section>
    </Modal>
  );
}
