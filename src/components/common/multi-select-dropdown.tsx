"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Second line under the label, e.g. a role or "3 შემსრულებელი". */
  hint?: string;
};

/**
 * Searchable checkbox dropdown. Selected options are listed first so it's
 * easy to see and undo what is already picked.
 */
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = "აირჩიეთ",
  searchPlaceholder = "ძიება…",
  emptyText = "ვერაფერი მოიძებნა",
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  /* Order is fixed when the list opens, so ticking a box doesn't make the
     row jump away from the pointer. */
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options
      .filter(
        (option) =>
          !normalized ||
          option.label.toLowerCase().includes(normalized) ||
          option.hint?.toLowerCase().includes(normalized),
      )
      .sort(
        (a, b) =>
          Number(pinned.has(b.value)) - Number(pinned.has(a.value)) ||
          a.label.localeCompare(b.label, "ka"),
      );
  }, [options, pinned, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) {
      setPinned(new Set(selected));
      setQuery("");
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
    setOpen(!open);
  }

  function toggleValue(value: string) {
    onChange(
      selectedSet.has(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  const selectedOptions = options.filter((option) => selectedSet.has(option.value));

  return (
    <div className={`multi-select${open ? " open" : ""}`} ref={rootRef}>
      <span className="multi-select-label">{label}</span>
      <button
        type="button"
        className="multi-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggleOpen}
      >
        <span className="multi-select-summary">
          {selectedOptions.length ? (
            selectedOptions.map((option) => (
              <span key={option.value} className="multi-select-chip">
                {option.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`${option.label} — მოხსნა`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleValue(option.value);
                  }}
                >
                  <X size={12} />
                </span>
              </span>
            ))
          ) : (
            <span className="multi-select-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className="multi-select-caret" />
      </button>

      {open ? (
        <div className="multi-select-panel">
          <label className="multi-select-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
          <ul id={listId} role="listbox" aria-multiselectable="true">
            {visibleOptions.length ? (
              visibleOptions.map((option) => {
                const checked = selectedSet.has(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      className={`multi-select-option${checked ? " checked" : ""}`}
                      onClick={() => toggleValue(option.value)}
                    >
                      <span className="multi-select-box" aria-hidden="true">
                        {checked ? <Check size={12} strokeWidth={3} /> : null}
                      </span>
                      <span className="multi-select-text">
                        <strong>{option.label}</strong>
                        {option.hint ? <small>{option.hint}</small> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="multi-select-empty">{emptyText}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
