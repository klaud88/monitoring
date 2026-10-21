"use client";

import { Archive } from "lucide-react";

/** Which records a list shows: soft-deleted ones are hidden by default. */
export type RecordState = "active" | "deleted" | "all";

export function matchesRecordState(
  record: { deletedAt?: string },
  state: RecordState,
) {
  if (state === "all") {
    return true;
  }
  return state === "deleted" ? Boolean(record.deletedAt) : !record.deletedAt;
}

export function RecordStateSelect({
  value,
  onChange,
}: {
  value: RecordState;
  onChange: (value: RecordState) => void;
}) {
  return (
    <label className="select-control">
      <Archive size={16} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as RecordState)}
        aria-label="ჩანაწერები"
      >
        <option value="active">აქტიური ჩანაწერები</option>
        <option value="deleted">წაშლილი ჩანაწერები</option>
        <option value="all">ყველა ჩანაწერი</option>
      </select>
    </label>
  );
}
