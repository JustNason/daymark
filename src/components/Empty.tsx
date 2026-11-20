import type { ElementType } from "react";
import { ArrowRight } from "lucide-react";

export function Empty({
  icon: Icon,
  title,
  text,
  action,
  onAction,
  compact,
}: {
  icon: ElementType;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 18 : 22} />
      <b>{title}</b>
      <p>{text}</p>
      {action && (
        <button
          type="button"
          className="button subtle small-button"
          onClick={onAction}
        >
          {action}
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
