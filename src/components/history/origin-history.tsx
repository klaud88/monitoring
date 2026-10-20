"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { HistoryRow, HistoryTextField } from "@/lib/history-view";

const modalTitles: Record<HistoryTextField, string> = {
  comment: "კომენტარის ისტორია",
  issue: "პრობლემის ტექსტის ისტორია",
};

/**
 * The edit rows of a "წარმოშობა" list. A row that changed the comment or the
 * problem text has a clickable label: it opens every earlier version of that
 * text, with who changed it and when.
 */
export function OriginHistoryRows({ rows }: { rows: HistoryRow[] }) {
  const [openField, setOpenField] = useState<HistoryTextField | null>(null);

  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="origin-row">
          {row.textField ? (
            <button
              type="button"
              className="origin-kind edit origin-kind-button"
              onClick={() => setOpenField(row.textField ?? null)}
              title="ძველი ვერსიების ნახვა"
            >
              {row.kindLabel}
            </button>
          ) : (
            <span className="origin-kind edit">{row.kindLabel}</span>
          )}
          <span className="origin-user">{row.user}</span>
          <span className="origin-change">
            {row.lines.map((line) => (
              <span
                key={line.field}
                className={`origin-change-line${line.field === "comment" || line.field === "issue" ? " text" : ""}`}
              >
                <b>{line.label}:</b>{" "}
                {line.field === "tags" ? line.to : `${line.from} → ${line.to}`}
              </span>
            ))}
          </span>
          <span className="origin-time">{row.time}</span>
        </div>
      ))}

      {openField ? (
        <TextHistoryModal
          field={openField}
          rows={rows}
          onClose={() => setOpenField(null)}
        />
      ) : null}
    </>
  );
}

function TextHistoryModal({
  field,
  rows,
  onClose,
}: {
  field: HistoryTextField;
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

  // Rows come newest first; each holds the text before and after that edit.
  const versions = rows.flatMap((row) =>
    row.lines
      .filter((line) => line.field === field)
      .map((line) => ({ id: row.id, user: row.user, time: row.time, from: line.from, to: line.to })),
  );

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
          <h2 id="history-modal-title">{modalTitles[field]}</h2>
          <button className="icon-button" type="button" aria-label="დახურვა" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <ol className="history-modal-list">
          {versions.map((version, index) => (
            <li key={version.id} className="history-version">
              <div className="history-version-meta">
                <strong>{version.user}</strong>
                <span>{version.time}</span>
              </div>
              <div className="history-version-text">
                <span className="history-version-label">
                  {index === 0 ? "მიმდინარე" : "გახდა"}
                </span>
                <p>{version.to}</p>
              </div>
              <div className="history-version-text old">
                <span className="history-version-label">
                  {index === versions.length - 1 ? "თავდაპირველი" : "იყო"}
                </span>
                <p>{version.from}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
