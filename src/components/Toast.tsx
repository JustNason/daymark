"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

export function Toast({
  message,
  onDismiss,
  kind = "status",
  duration = 4000,
}: {
  message: string;
  onDismiss: () => void;
  kind?: "status" | "alert";
  duration?: number;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [duration, message]);
  return (
    <div
      className="toast"
      role={kind === "alert" ? "alert" : "status"}
      aria-live={kind === "alert" ? "assertive" : "polite"}
    >
      {message}
      <IconButton label="Dismiss notification" onClick={onDismiss}>
        <X size={13} />
      </IconButton>
    </div>
  );
}
