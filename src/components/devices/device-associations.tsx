"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cpu, Plus, X } from "lucide-react";

type SiblingLink = {
  id: string;
  name: string;
  status: "online" | "offline" | "error";
};

type Props = {
  deviceId: string;
  siblings: SiblingLink[];
  manual: string[];
  /** Names offered by the picker — every other device in the system. */
  options: string[];
  canEdit: boolean;
};

export function DeviceAssociations({
  deviceId,
  siblings,
  manual,
  options,
  canEdit,
}: Props) {
  const router = useRouter();
  const [links, setLinks] = useState(manual);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function persist(next: string[]) {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/devices/${deviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ associatedDevices: next }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("შენახვა ვერ მოხერხდა.");
      return false;
    }

    setLinks(next);
    router.refresh();
    return true;
  }

  async function addLink() {
    const name = draft.trim();
    if (!name) {
      return;
    }

    if (
      links.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())
    ) {
      setAdding(false);
      setDraft("");
      return;
    }

    const saved = await persist([...links, name]);
    if (saved) {
      setAdding(false);
      setDraft("");
    }
  }

  async function removeLink(name: string) {
    await persist(links.filter((item) => item !== name));
  }

  const isEmpty = siblings.length === 0 && links.length === 0;

  return (
    <div className="device-assoc">
      <div className="device-assoc-chips">
        {siblings.map((sibling) => (
          <Link
            key={sibling.id}
            className="assoc-chip"
            href={`/devices/${sibling.id}`}
            title={`${sibling.name} — ${sibling.status}`}
          >
            <i className={`status-dot ${sibling.status}`} />
            <span>{sibling.name}</span>
          </Link>
        ))}

        {links.map((name) => (
          <span key={name} className="assoc-chip manual">
            <Cpu size={12} />
            <span>{name}</span>
            {canEdit ? (
              <button
                type="button"
                className="assoc-chip-remove"
                onClick={() => void removeLink(name)}
                disabled={saving}
                aria-label={`${name} — კავშირის მოხსნა`}
                title="მოხსნა"
              >
                <X size={11} />
              </button>
            ) : null}
          </span>
        ))}

        {isEmpty && !adding ? (
          <span className="assoc-empty">ასოცირებული მოწყობილობა არ არის</span>
        ) : null}

        {canEdit && !adding ? (
          <button
            type="button"
            className="assoc-add"
            onClick={() => setAdding(true)}
            aria-label="ასოცირებული მოწყობილობის დამატება"
            title="დამატება"
          >
            <Plus size={13} strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="assoc-form">
          <input
            list="assoc-device-options"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addLink();
              }
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            placeholder="მოწყობილობის სახელი"
            autoFocus
          />
          <datalist id="assoc-device-options">
            {options.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            className="primary-button"
            type="button"
            onClick={() => void addLink()}
            disabled={saving || !draft.trim()}
          >
            <Plus size={15} />
            <span>დამატება</span>
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setAdding(false);
              setDraft("");
              setError("");
            }}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
