"use client";

import { SlidersHorizontal } from "lucide-react";

/**
 * Phone-width control that sits next to a search field and expands the rest of
 * a toolbar. The toolbar itself does the hiding through `data-filters-open`, so
 * the desktop layout is untouched and this button never renders there.
 */
export function FiltersToggle({
  open,
  count = 0,
  onToggle,
}: {
  open: boolean;
  count?: number;
  onToggle: () => void;
}) {
  return (
    <button
      className={`filters-toggle${open ? " active" : ""}`}
      type="button"
      aria-expanded={open}
      aria-label={open ? "ფილტრების დაკეცვა" : "ფილტრების გაშლა"}
      title="ფილტრები"
      onClick={onToggle}
    >
      <SlidersHorizontal size={17} strokeWidth={1.9} />
      {count > 0 ? <span className="filters-toggle-count">{count}</span> : null}
    </button>
  );
}
