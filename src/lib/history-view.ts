import type { EntityAuditEntry } from "./repositories";
import type { TaskChange, TaskChangeField } from "./task-history";
import { readTaskChanges } from "./task-history";
import type { TaskPriority, TaskStatus } from "./types";

/*
 * Audit rows of a task or problem report, shaped for the "წარმოშობა" list
 * (src/components/history/origin-history.tsx). Formatted here on the server
 * so the browser renders exactly what the server did.
 */

export type HistoryTextField = "comment" | "issue";

export type HistoryLine = {
  field: TaskChangeField;
  label: string;
  from: string;
  to: string;
};

export type HistoryRow = {
  id: string;
  kindLabel: string;
  /** Set when the row changed a long text: its label opens that text's history. */
  textField?: HistoryTextField;
  user: string;
  time: string;
  at: string;
  lines: HistoryLine[];
};

const fieldLabels: Record<TaskChangeField, string> = {
  status: "სტატუსი",
  priority: "პრიორიტეტი",
  assignees: "შემსრ.",
  dueDate: "ვადა",
  title: "სათაური",
  issue: "პრობლემა",
  comment: "კომენტარი",
  tags: "ტეგები",
};

const actionLabels: Record<string, string> = {
  "task.update": "რედაქტირება",
  "task.status_local_change": "სტატუსის შეცვლა",
  "task.assign": "შემსრულებლის შეცვლა",
  "problem_report.update": "რედაქტირება",
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
    const all = readTaskChanges(entry.metadata);
    const changes = all.filter((change) => keep(change.field));
    if (all.length && !changes.length) {
      // Every change in it is hidden from this viewer.
      return [];
    }
    const textField: HistoryTextField | undefined = changes.some(
      (change) => change.field === "comment",
    )
      ? "comment"
      : changes.some((change) => change.field === "issue")
        ? "issue"
        : undefined;

    return [
      {
        id: entry.id,
        kindLabel: getKindLabel(entry.action, changes, textField),
        textField,
        user: entry.userName ?? "უცნობი",
        time: formatDateTime(entry.createdAt),
        at: entry.createdAt,
        lines: changes.map((change) => toLine(change, userNames)),
      },
    ];
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

function getKindLabel(
  action: string,
  changes: TaskChange[],
  textField: HistoryTextField | undefined,
) {
  if (textField === "comment") {
    return "კომენტარის ცვლილება";
  }
  if (textField === "issue") {
    return "პრობლემის ცვლილება";
  }
  if (changes.length && changes.every((change) => change.field === "tags")) {
    return "ტეგების ცვლილება";
  }
  if (changes.length && changes.every((change) => change.field === "status")) {
    return "სტატუსის შეცვლა";
  }
  return actionLabels[action] ?? "რედაქტირება";
}

function toLine(change: TaskChange, userNames: Map<string, string>): HistoryLine {
  const label = fieldLabels[change.field];
  switch (change.field) {
    case "status":
      return { field: change.field, label, from: statusLabels[change.from], to: statusLabels[change.to] };
    case "priority":
      return { field: change.field, label, from: priorityLabels[change.from], to: priorityLabels[change.to] };
    case "dueDate":
      return { field: change.field, label, from: formatDate(change.from), to: formatDate(change.to) };
    case "assignees":
      return {
        field: change.field,
        label,
        from: names(change.from, userNames),
        to: names(change.to, userNames),
      };
    case "tags": {
      const added = change.to.filter((tag) => !change.from.includes(tag));
      const removed = change.from.filter((tag) => !change.to.includes(tag));
      return {
        field: change.field,
        label,
        from: change.from.join(", ") || "—",
        to: [
          ...added.map((tag) => `+${tag}`),
          ...removed.map((tag) => `−${tag}`),
        ].join(" "),
      };
    }
    default:
      return { field: change.field, label, from: change.from || "—", to: change.to || "—" };
  }
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
