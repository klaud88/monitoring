import type { EntityAuditEntry } from "./repositories";
import type { TaskChange, TaskChangeField } from "./task-history";
import { readTaskChanges } from "./task-history";
import type { TaskPriority, TaskStatus } from "./types";

/*
 * Audit rows of a task or problem report, shaped for the "ცვლილების
 * ისტორია" list (src/components/history/origin-history.tsx): one row per
 * changed field. Formatted here on the server so the browser renders exactly
 * what the server did.
 */

export type HistoryRow = {
  id: string;
  /** The changed field; absent on rows logged before fields were recorded. */
  field?: TaskChangeField;
  kindLabel: string;
  /** One line for the list: the new text, "+tag −tag" or "old → new". */
  summary: string;
  /** Full values for the field's history modal. */
  from: string;
  to: string;
  user: string;
  time: string;
  at: string;
};

export const fieldLabels: Record<TaskChangeField, string> = {
  status: "სტატუსი",
  priority: "პრიორიტეტი",
  assignees: "შემსრულებელი",
  dueDate: "ვადა",
  title: "სათაური",
  issue: "პრობლემა",
  comment: "კომენტარი",
  phone: "ტელეფონი",
  tags: "ტეგები",
};

const statusLabels: Record<TaskStatus, string> = {
  planned: "დაგეგმილი",
  in_progress: "მიმდინარეობს",
  blocked: "შეჩერებული",
  done: "დასრულებული",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "დაბალი",
  normal: "ჩვეულებრივი",
  high: "მაღალი",
  urgent: "სასწრაფო",
};

export function buildHistoryRows(
  entries: EntityAuditEntry[],
  userNames: Map<string, string>,
  /** Drop changes of these fields (e.g. a comment the viewer may not see). */
  keep: (field: TaskChangeField) => boolean = () => true,
): HistoryRow[] {
  return entries.flatMap((entry) => {
    const base = {
      user: entry.userName ?? "უცნობი",
      time: formatDateTime(entry.createdAt),
      at: entry.createdAt,
    };

    // Logged before changes were recorded: one plain row, nothing to open.
    if (!hasChangeList(entry.metadata)) {
      return [{ ...base, id: entry.id, kindLabel: "რედაქტირება", summary: "", from: "", to: "" }];
    }

    // A save that changed nothing (or nothing this viewer may see) is left out.
    return readTaskChanges(entry.metadata)
      .filter((change) => keep(change.field))
      .map((change) => ({
        ...base,
        ...describe(change, userNames),
        id: `${entry.id}:${change.field}`,
        field: change.field,
        kindLabel: fieldLabels[change.field],
      }));
  });
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tbilisi",
  }).format(date);
}

function hasChangeList(metadata: unknown) {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      Array.isArray((metadata as { changes?: unknown }).changes),
  );
}

function describe(
  change: TaskChange,
  userNames: Map<string, string>,
): Pick<HistoryRow, "summary" | "from" | "to"> {
  switch (change.field) {
    case "status":
      return arrow(statusLabels[change.from], statusLabels[change.to]);
    case "priority":
      return arrow(priorityLabels[change.from], priorityLabels[change.to]);
    case "dueDate":
      return arrow(formatDate(change.from), formatDate(change.to));
    case "assignees":
      return arrow(names(change.from, userNames), names(change.to, userNames));
    case "tags": {
      const added = change.to.filter((tag) => !change.from.includes(tag));
      const removed = change.from.filter((tag) => !change.to.includes(tag));
      return {
        summary: [...added.map((tag) => `+${tag}`), ...removed.map((tag) => `−${tag}`)].join(" "),
        from: change.from.join(", ") || "—",
        to: change.to.join(", ") || "—",
      };
    }
    default:
      // Long texts: the list shows what it became; the modal has the old one.
      return { summary: change.to || "—", from: change.from || "—", to: change.to || "—" };
  }
}

function arrow(from: string, to: string) {
  return { summary: `${from} → ${to}`, from, to };
}

function names(ids: string[], userNames: Map<string, string>) {
  return ids.length
    ? ids.map((id) => userNames.get(id) ?? "წაშლილი მომხმარებელი").join(", ")
    : "—";
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || "—";
  }
  return new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}
