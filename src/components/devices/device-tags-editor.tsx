"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Edit3, Plus, Save, X } from "lucide-react";
import { mergeTags } from "@/lib/tags";
import type { Device } from "@/lib/types";

type Props = {
  device: Device;
  availableTags: string[];
  canEdit: boolean;
};

export function DeviceTagsEditor({ device, availableTags, canEdit }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState(device.tags);
  const [draftTags, setDraftTags] = useState(device.tags);
  const [customTag, setCustomTag] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const tagOptions = useMemo(
    () => mergeTags(availableTags, tags, draftTags),
    [availableTags, draftTags, tags],
  );

  function startEdit() {
    setDraftTags(tags);
    setCustomTag("");
    setError("");
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraftTags(tags);
    setCustomTag("");
    setError("");
    setIsEditing(false);
  }

  function toggleTag(tagName: string) {
    setDraftTags((current) =>
      current.includes(tagName)
        ? current.filter((tag) => tag !== tagName)
        : [...current, tagName],
    );
  }

  function addCustomTag() {
    const tagName = customTag.trim();
    if (!tagName) {
      return;
    }

    setDraftTags((current) =>
      current.includes(tagName) ? current : [...current, tagName],
    );
    setCustomTag("");
  }

  async function saveTags() {
    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: device.code,
        name: device.name,
        status: device.status,
        isExcluded: device.isExcluded,
        region: device.region,
        position: device.position,
        tags: draftTags,
      }),
    }).catch(() => null);

    setIsSaving(false);

    if (!response?.ok) {
      setError("ტეგების შენახვა ვერ მოხერხდა.");
      return;
    }

    const payload = (await response.json()) as { device?: Device };
    const nextTags = payload.device?.tags ?? draftTags;
    setTags(nextTags);
    setDraftTags(nextTags);
    setIsEditing(false);
    router.refresh();
  }

  return (
    <div className="surface stat-surface device-tags-editor">
      <Activity size={20} />
      <span>ტეგები</span>
      <DeviceTagList tags={isEditing ? draftTags : tags} />

      {canEdit ? (
        <div className="device-tags-editor-actions">
          {isEditing ? (
            <>
              <button
                className="ghost-button"
                type="button"
                onClick={saveTags}
                disabled={isSaving}
              >
                <Save size={16} />
                <span>შენახვა</span>
              </button>
              <button className="ghost-button" type="button" onClick={cancelEdit}>
                <X size={16} />
                <span>გაუქმება</span>
              </button>
            </>
          ) : (
            <button className="ghost-button" type="button" onClick={startEdit}>
              <Edit3 size={16} />
              <span>რედაქტირება</span>
            </button>
          )}
        </div>
      ) : null}

      {isEditing ? (
        <div className="device-tags-edit-panel">
          <div className="row-tags">
            {tagOptions.map((tagName) => (
              <button
                key={tagName}
                type="button"
                className={`tag-toggle compact ${
                  draftTags.includes(tagName) ? "active" : ""
                }`}
                onClick={() => toggleTag(tagName)}
              >
                {tagName}
              </button>
            ))}
          </div>
          <div className="device-tag-create">
            <input
              value={customTag}
              onChange={(event) => setCustomTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomTag();
                }
              }}
              placeholder="ახალი ტეგი"
            />
            <button className="ghost-button" type="button" onClick={addCustomTag}>
              <Plus size={15} />
              <span>დამატება</span>
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function DeviceTagList({ tags }: { tags: string[] }) {
  if (!tags.length) {
    return <strong className="device-tags-empty">ტეგი არ აქვს</strong>;
  }

  return (
    <div className="device-tags-list">
      {tags.map((tagName) => (
        <span key={tagName} className="tag-toggle compact active">
          {tagName}
        </span>
      ))}
    </div>
  );
}
