import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import type { AppUser } from "@/lib/types";

/** Assignee picker button in the person's own colour, as in avatar stacks. */
export function AssigneeToggle({
  user,
  selected,
  onToggle,
}: {
  user: Pick<AppUser, "id" | "name" | "initials" | "color">;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`tag-toggle compact assignee-toggle${selected ? " active" : ""}`}
      aria-pressed={selected}
      style={{ "--user-color": user.color } as CSSProperties}
      onClick={onToggle}
    >
      <span className="assignee-toggle-avatar" aria-hidden="true">
        {selected ? <Check size={11} strokeWidth={3.2} /> : user.initials}
      </span>
      {user.name}
    </button>
  );
}
