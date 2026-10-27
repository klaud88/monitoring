"use client";

import type { TaskStatus } from "@/lib/types";

const statusOrder: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];

const statusLabels: Record<TaskStatus, string> = {
  planned: "დაგეგმილი",
  in_progress: "მიმდინარეობს",
  blocked: "შეჩერებული",
  done: "დასრულებული",
};

/**
 * The form's status as four large tinted buttons — the colours of the list's
 * status chips — so it is the first thing found when editing.
 */
export function StatusPicker({
  value,
  onChange,
  className = "",
}: {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  className?: string;
}) {
  return (
    <div className={`task-field status-picker-field ${className}`.trim()}>
      <span>სტატუსი</span>
      <div className="status-picker" role="radiogroup" aria-label="სტატუსი">
        {statusOrder.map((status) => (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={value === status}
            className={`status-picker-option ${status}${value === status ? " active" : ""}`}
            onClick={() => onChange(status)}
          >
            <span className={`status-dot ${status}`} />
            {statusLabels[status]}
          </button>
        ))}
      </div>
    </div>
  );
}
