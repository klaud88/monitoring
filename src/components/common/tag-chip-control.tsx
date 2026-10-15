"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Tag, Trash2, X } from "lucide-react";

/**
 * One tag in a picker: click to toggle, ✏️ to rename in place (Enter saves,
 * Esc cancels), 🗑 to delete. Rename and delete are offered only when their
 * handlers are passed, i.e. when the user may manage tags.
 */
export function TagChipControl({
  name,
  selected,
  onToggle,
  onRename,
  onDelete,
  busy = false,
  showIcon = false,
}: {
  name: string;
  selected: boolean;
  onToggle: () => void;
  /** Resolves true once the new name is saved. */
  onRename?: (newName: string) => Promise<boolean> | boolean;
  onDelete?: () => void;
  busy?: boolean;
  showIcon?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  async function save() {
    const next = value.trim().replace(/\s+/g, " ");
    if (!onRename || !next || next === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    setSaving(true);
    const saved = await onRename(next);
    setSaving(false);
    if (saved) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <span className="tag-chip-control editing">
        <input
          ref={inputRef}
          className="tag-rename-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
              setValue(name);
            }
          }}
          maxLength={120}
          aria-label={`${name} — ახალი სახელი`}
          disabled={saving}
        />
        <button
          type="button"
          className="tag-delete-button tag-rename-save"
          onClick={() => void save()}
          disabled={saving}
          aria-label="სახელის შენახვა"
          title="შენახვა"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          className="tag-delete-button"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          disabled={saving}
          aria-label="გაუქმება"
          title="გაუქმება"
        >
          <X size={12} />
        </button>
      </span>
    );
  }

  return (
    <span className="tag-chip-control">
      <button
        type="button"
        className={`tag-toggle compact ${selected ? "active" : ""}`}
        onClick={onToggle}
      >
        {showIcon ? <Tag size={13} /> : null}
        {name}
      </button>
      {onRename ? (
        <button
          type="button"
          className="tag-delete-button tag-rename-button"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          disabled={busy}
          aria-label={`${name} ტეგის სახელის შეცვლა`}
          title="სახელის შეცვლა"
        >
          <Pencil size={11} />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className="tag-delete-button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`${name} ტეგის წაშლა`}
          title="ტეგის წაშლა"
        >
          <Trash2 size={12} />
        </button>
      ) : null}
    </span>
  );
}
