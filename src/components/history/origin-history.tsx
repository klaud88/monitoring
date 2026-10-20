"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { HistoryRow } from "@/lib/history-view";
import type { TaskChangeField } from "@/lib/task-history";

/**
 * The edit rows of a "ცვლილების ისტორია" list, one per changed field. A
 * row's label is the field; clicking it opens every change of that field,
 * with what it was before, who changed it and when.
 */
export function OriginHistoryRows({ rows }: { rows: HistoryRow[] }) {
  const [openField, setOpenField] = useState<TaskChangeField | null>(null);

  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="origin-row">
          {row.field ? (
            <button
              type="button"
              className="origin-kind edit origin-kind-button"
              onClick={() => setOpenField(row.field ?? null)}
              title="წინა ცვლილებების ნახვა"
            >
              {row.kindLabel}
            </button>
          ) : (
            <span className="origin-kind edit">{row.kindLabel}</span>
          )}
          <span className="origin-user">{row.user}</span>
          <span className="origin-summary" title={row.summary || undefined}>
            {row.summary}
          </span>
          <span className="origin-time">{row.time}</span>
        </div>
      ))}

      {openField ? (
        <FieldHistoryModal
          rows={rows.filter((row) => row.field === openField)}
          onClose={() => setOpenField(null)}
        />
      ) : null}
    </>
  );
}

function FieldHistoryModal({
  rows,
  onClose,
}: {
  /** Changes of one field, newest first. */
  rows: HistoryRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="confirm-dialog history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="history-modal-head">
          <h2 id="history-modal-title">
            {rows[0]?.kindLabel} — ცვლილების ისტორია
          </h2>
          <button className="icon-button" type="button" aria-label="დახურვა" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <ol className="history-modal-list">
          {rows.map((row, index) => (
            <li key={row.id} className="history-version">
              <div className="history-version-meta">
                <strong>{row.user}</strong>
                <span>{row.time}</span>
              </div>
              <div className="history-version-text">
                <span className="history-version-label">
                  {index === 0 ? "მიმდინარე" : "გახდა"}
                </span>
                <p>{row.to}</p>
              </div>
              <div className="history-version-text old">
                <span className="history-version-label">
                  {index === rows.length - 1 ? "თავდაპირველი" : "იყო"}
                </span>
                <p>{row.from}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
