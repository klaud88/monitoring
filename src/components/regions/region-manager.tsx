"use client";

import { useMemo, useState } from "react";
import {
  Edit3,
  MapPinned,
  Plus,
  Save,
  Search,
  Tags,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { TBILISI_CENTER, clampLatLng } from "@/lib/geo";
import { mergeTags } from "@/lib/tags";
import type { Device, DeviceStatus, Region } from "@/lib/types";

type DeviceDraft = {
  name: string;
  region: string;
  status: DeviceStatus;
  isExcluded: boolean;
  lat: number;
  lng: number;
  tags: string[];
};

type RegionPermissions = {
  createDevice: boolean;
  editDevice: boolean;
  deleteDevice: boolean;
  createTags: boolean;
  deleteTags: boolean;
  createRegion: boolean;
  editRegion: boolean;
  deleteRegion: boolean;
};

type RegionDraft = {
  name: string;
  color: string;
};

type DeviceSortMode = "az" | "za" | "region";

const unassignedRegion = "დაუნაწილებელი";

export function RegionManager({
  initialDevices,
  initialRegions,
  initialTags,
  permissions,
}: {
  initialDevices: Device[];
  initialRegions: Region[];
  initialTags: string[];
  permissions: RegionPermissions;
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [regions, setRegions] = useState(initialRegions);
  const [query, setQuery] = useState("");
  const [deviceSort, setDeviceSort] = useState<DeviceSortMode>("az");
  const [regionFilter, setRegionFilter] = useState("all");
  const [availableTags, setAvailableTags] = useState<string[]>(() =>
    mergeTags(
      initialTags,
      initialDevices.flatMap((device) => device.tags),
    ),
  );
  const [newTagName, setNewTagName] = useState("");
  const [draft, setDraft] = useState<DeviceDraft>({
    name: "",
    region: initialRegions[0]?.name || "",
    status: "online",
    isExcluded: false,
    lat: TBILISI_CENTER.lat,
    lng: TBILISI_CENTER.lng,
    tags: [],
  });
  const [newRegion, setNewRegion] = useState<RegionDraft>({
    name: "",
    color: "#2563eb",
  });
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [regionEdit, setRegionEdit] = useState<RegionDraft>({
    name: "",
    color: "#2563eb",
  });
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceEdit, setDeviceEdit] = useState<DeviceDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();

  const regionNames = regions.map((region) => region.name);

  const filteredDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return devices
      .filter(
        (device) =>
          (regionFilter === "all" || device.region === regionFilter) &&
          (!normalized ||
            device.name.toLowerCase().includes(normalized) ||
            device.region.toLowerCase().includes(normalized)),
      )
      .sort((a, b) => compareDevices(a, b, deviceSort));
  }, [devices, deviceSort, query, regionFilter]);

  function toggleDraftTag(tagName: string) {
    setDraft((current) => ({
      ...current,
      tags: toggleListValue(current.tags, tagName),
    }));
  }

  function toggleEditTag(tagName: string) {
    setDeviceEdit((current) =>
      current
        ? {
            ...current,
            tags: toggleListValue(current.tags, tagName),
          }
        : current,
    );
  }

  async function createTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await createAvailableTag(newTagName);
    if (created) {
      setNewTagName("");
    }
  }

  async function createAvailableTag(tagName: string) {
    if (!permissions.createTags) {
      return null;
    }

    const normalizedTag = tagName.trim().replace(/\s+/g, " ");
    if (!normalizedTag) {
      return null;
    }

    if (availableTags.includes(normalizedTag)) {
      return normalizedTag;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/device-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: normalizedTag }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("ტეგის დამატება ვერ მოხერხდა.");
      return null;
    }

    const data = (await response.json()) as {
      tag?: string;
      tags?: string[];
    };
    const createdTag = data.tag ?? normalizedTag;
    setAvailableTags((current) =>
      mergeTags(data.tags ?? current, [createdTag]),
    );
    return createdTag;
  }

  async function removeAvailableTag(tagName: string) {
    if (!permissions.deleteTags) {
      return false;
    }

    const confirmed = await confirm({
      message: `ნამდვილად გსურთ "${tagName}" ტეგის წაშლა? ტეგი ყველა X-Station-იდან მოიხსნება.`,
    });
    if (!confirmed) {
      return false;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/device-tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("ტეგის წაშლა ვერ მოხერხდა.");
      return false;
    }

    const data = (await response.json()) as { tags?: string[] };
    setAvailableTags((current) =>
      data.tags ?? current.filter((tag) => tag !== tagName),
    );
    setDevices((current) =>
      current.map((device) => ({
        ...device,
        tags: device.tags.filter((tag) => tag !== tagName),
      })),
    );
    setDraft((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag !== tagName),
    }));
    setDeviceEdit((current) =>
      current
        ? { ...current, tags: current.tags.filter((tag) => tag !== tagName) }
        : current,
    );
    return true;
  }

  async function createRegion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.createRegion) {
      return;
    }

    const payload = {
      name: newRegion.name.trim(),
      color: newRegion.color,
    };
    if (!payload.name) {
      setError("რაიონის სახელი აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/regions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!response.ok) {
      setError("რაიონის დამატება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { region: Region };
    setRegions((current) => [...current, data.region]);
    setDraft((current) =>
      current.region ? current : { ...current, region: data.region.name },
    );
    setNewRegion({ name: "", color: "#2563eb" });
  }

  function startEditRegion(region: Region) {
    setEditingRegionId(region.id);
    setRegionEdit({ name: region.name, color: region.color });
    setError("");
  }

  async function saveRegion(region: Region) {
    if (!permissions.editRegion) {
      return;
    }

    const payload = {
      name: regionEdit.name.trim(),
      color: regionEdit.color,
    };
    if (!payload.name) {
      setError("რაიონის სახელი აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/regions/${region.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!response.ok) {
      setError("რაიონის რედაქტირება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { region: Region };
    setRegions((current) =>
      current.map((item) => (item.id === region.id ? data.region : item)),
    );
    setDevices((current) =>
      current.map((device) =>
        device.region === region.name
          ? { ...device, region: data.region.name }
          : device,
      ),
    );
    setDraft((current) =>
      current.region === region.name
        ? { ...current, region: data.region.name }
        : current,
    );
    setEditingRegionId(null);
  }

  async function removeRegion(region: Region) {
    if (!permissions.deleteRegion) {
      return;
    }

    const confirmed = await confirm({
      message:
        "ნამდვილად გსურთ აღნიშნულის წაშლა? ამ რაიონზე მიბმული X-Station-ები დარჩებიან რაიონის გარეშე.",
    });
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/regions/${region.id}`, {
      method: "DELETE",
    });
    setSaving(false);

    if (!response.ok) {
      setError("რაიონის წაშლა ვერ მოხერხდა.");
      return;
    }

    setRegions((current) => current.filter((item) => item.id !== region.id));
    setDevices((current) =>
      current.map((device) =>
        device.region === region.name
          ? { ...device, region: unassignedRegion }
          : device,
      ),
    );
    setDraft((current) =>
      current.region === region.name ? { ...current, region: "" } : current,
    );
  }

  async function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.createDevice) {
      return;
    }

    const payload = devicePayload(draft);
    if (!payload.name) {
      setError("X-Station-ის სახელი აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!response.ok) {
      setError("X-Station-ის დამატება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { device: Device };
    setDevices((current) => [data.device, ...current]);
    setDraft({
      name: "",
      region: draft.region,
      status: "online",
      isExcluded: false,
      lat: TBILISI_CENTER.lat,
      lng: TBILISI_CENTER.lng,
      tags: [],
    });
  }

  function startEditDevice(device: Device) {
    setEditingDeviceId(device.id);
    setDeviceEdit({
      name: device.name,
      region: device.region === unassignedRegion ? "" : device.region,
      status: device.status,
      isExcluded: device.isExcluded,
      lat: device.position.lat,
      lng: device.position.lng,
      tags: device.tags,
    });
    setError("");
  }

  async function saveDevice(deviceId: string) {
    if (!permissions.editDevice || !deviceEdit) {
      return;
    }

    const payload = devicePayload(deviceEdit);
    if (!payload.name) {
      setError("X-Station-ის სახელი აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/devices/${deviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!response.ok) {
      setError("X-Station-ის რედაქტირება ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { device: Device };
    setDevices((current) =>
      current.map((device) => (device.id === deviceId ? data.device : device)),
    );
    setEditingDeviceId(null);
    setDeviceEdit(null);
  }

  async function toggleDeviceExclusion(device: Device) {
    if (!permissions.editDevice) {
      return;
    }

    const isExcluded = !device.isExcluded;
    setDevices((current) =>
      current.map((item) =>
        item.id === device.id ? { ...item, isExcluded } : item,
      ),
    );
    setSaving(true);
    setError("");

    const response = await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(devicePayloadFromDevice(device, isExcluded)),
    });
    setSaving(false);

    if (!response.ok) {
      setDevices((current) =>
        current.map((item) =>
          item.id === device.id
            ? { ...item, isExcluded: device.isExcluded }
            : item,
        ),
      );
      setError("X-Station-ის ჩართვა/გამორთვა ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { device: Device };
    setDevices((current) =>
      current.map((item) => (item.id === device.id ? data.device : item)),
    );
  }

  async function removeDevice(deviceId: string) {
    if (!permissions.deleteDevice) {
      return;
    }

    const confirmed = await confirm();
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/devices/${deviceId}`, {
      method: "DELETE",
    });
    setSaving(false);

    if (!response.ok) {
      setError("X-Station-ის წაშლა ვერ მოხერხდა.");
      return;
    }

    setDevices((current) => current.filter((device) => device.id !== deviceId));
  }

  const regionSummary = regions.map((region) => ({
    region,
    count: devices.filter((device) => device.region === region.name).length,
  }));

  return (
    <div className="regions-page">
      {confirmationDialog}
      <section className="page-header">
        <div>
          <p className="eyebrow">X-Stations</p>
          <h1>რაიონებისა და X-Station-ების მართვა</h1>
          <p>რაიონების, ტეგების და X-Station ჩანაწერების CRUD მართვა.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <MapPinned size={18} />
            <span>{devices.length}</span>
            <small>X-Station</small>
          </div>
          <div className="metric">
            <Tags size={18} />
            <span>{regions.length}</span>
            <small>რაიონი</small>
          </div>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <section className="content-grid region-grid">
        <aside className="region-left-column">
          <section className="surface">
          <div className="section-title">
            <h2>რაიონები</h2>
            <MapPinned size={20} />
          </div>

          {permissions.createRegion ? (
            <form className="region-admin-form" onSubmit={createRegion}>
              <input
                value={newRegion.name}
                onChange={(event) =>
                  setNewRegion((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="ახალი რაიონი"
              />
              <input
                type="color"
                value={newRegion.color}
                onChange={(event) =>
                  setNewRegion((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
                aria-label="რაიონის ფერი"
              />
              <button className="primary-button" type="submit" disabled={saving}>
                <Plus size={16} />
                <span>დამატება</span>
              </button>
            </form>
          ) : null}

          <div className="region-admin-list">
            {regionSummary.map((item) => (
              <div key={item.region.id} className="region-admin-row">
                {editingRegionId === item.region.id ? (
                  <>
                    <input
                      value={regionEdit.name}
                      onChange={(event) =>
                        setRegionEdit((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="color"
                      value={regionEdit.color}
                      onChange={(event) =>
                        setRegionEdit((current) => ({
                          ...current,
                          color: event.target.value,
                        }))
                      }
                      aria-label="რაიონის ფერი"
                    />
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => saveRegion(item.region)}
                        disabled={saving}
                        aria-label="შენახვა"
                        title="შენახვა"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => setEditingRegionId(null)}
                        aria-label="გაუქმება"
                        title="გაუქმება"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span
                      className="region-swatch"
                      style={{ backgroundColor: item.region.color }}
                    />
                    <div>
                      <strong>{item.region.name}</strong>
                      <small>{item.count} X-Station</small>
                    </div>
                    <div className="row-actions">
                      {permissions.editRegion ? (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => startEditRegion(item.region)}
                          aria-label="რაიონის რედაქტირება"
                          title="რაიონის რედაქტირება"
                        >
                          <Edit3 size={16} />
                        </button>
                      ) : null}
                      {permissions.deleteRegion ? (
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => removeRegion(item.region)}
                          aria-label="რაიონის წაშლა"
                          title="რაიონის წაშლა"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          </section>

          {permissions.createDevice ? (
            <form
              className="surface admin-form device-create-form"
              onSubmit={createDevice}
            >
              <div className="section-title">
                <h2>ახალი X-Station</h2>
                <Plus size={20} />
              </div>
              <DeviceDraftFields
                draft={draft}
                onChange={(partial) =>
                  setDraft((current) => ({ ...current, ...partial }))
                }
                regionNames={regionNames}
                availableTags={availableTags}
                toggleTag={toggleDraftTag}
                canCreateTags={permissions.createTags}
                canDeleteTags={permissions.deleteTags}
                onCreateTag={createAvailableTag}
                onDeleteTag={removeAvailableTag}
              />
              <button className="primary-button" type="submit" disabled={saving}>
                <Plus size={18} />
                <span>X-Station-ის დამატება</span>
              </button>
            </form>
          ) : null}
        </aside>

        <section className="surface">
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ძებნა სახელით ან რაიონით"
              />
            </div>
            <label className="select-control compact-filter-control">
              <select
                value={deviceSort}
                onChange={(event) =>
                  setDeviceSort(event.target.value as DeviceSortMode)
                }
                aria-label="დალაგება"
              >
                <option value="az">A-Z</option>
                <option value="za">Z-A</option>
                <option value="region">რაიონების მიხედვით</option>
              </select>
            </label>
            <label className="select-control compact-filter-control">
              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
                aria-label="რაიონის ფილტრი"
              >
                <option value="all">ყველა რაიონი</option>
                <option value={unassignedRegion}>რაიონის გარეშე</option>
                {regionNames.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {permissions.createTags ? (
            <form className="tag-create-form" onSubmit={createTag}>
              <div className="search-field">
                <Tags size={18} />
                <input
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder="ახალი ტეგი"
                  maxLength={120}
                />
              </div>
              <button className="primary-button" type="submit" disabled={saving}>
                <Plus size={18} />
                <span>ტეგის დამატება</span>
              </button>
            </form>
          ) : null}

          <div className="region-device-list">
            {filteredDevices.map((device) =>
              editingDeviceId === device.id && deviceEdit ? (
                <article key={device.id} className="region-device-row editing">
                  <DeviceDraftFields
                    draft={deviceEdit}
                    onChange={(partial) =>
                      setDeviceEdit((current) =>
                        current ? { ...current, ...partial } : current,
                      )
                    }
                    regionNames={regionNames}
                    availableTags={availableTags}
                    toggleTag={toggleEditTag}
                    canCreateTags={permissions.createTags}
                    canDeleteTags={permissions.deleteTags}
                    onCreateTag={createAvailableTag}
                    onDeleteTag={removeAvailableTag}
                  />
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => saveDevice(device.id)}
                      disabled={saving}
                    >
                      <Save size={16} />
                      <span>შენახვა</span>
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setEditingDeviceId(null);
                        setDeviceEdit(null);
                      }}
                    >
                      <X size={16} />
                      <span>გაუქმება</span>
                    </button>
                  </div>
                </article>
              ) : (
                <article key={device.id} className="region-device-row">
                  <div>
                    <strong>{device.name}</strong>
                    <span>{device.status}</span>
                  </div>
                  <div>
                    <strong>{device.region}</strong>
                    <span>
                      Lat {device.position.lat.toFixed(6)}, Lng {device.position.lng.toFixed(6)}
                    </span>
                  </div>
                  <div className="row-tags">
                    {device.tags.length ? (
                      device.tags.map((tagName) => (
                        <span key={tagName} className="tag-toggle compact active">
                          {tagName}
                        </span>
                      ))
                    ) : (
                      <span className="muted">ტეგი არ აქვს</span>
                    )}
                  </div>
                  <div className="device-exclusion-cell">
                    <button
                      className={`device-exclusion-toggle ${device.isExcluded ? "active" : ""}`}
                      type="button"
                      onClick={() => toggleDeviceExclusion(device)}
                      disabled={!permissions.editDevice || saving}
                      aria-pressed={device.isExcluded}
                      title="ჩართვისას X-Station რუკაზე, ანალიტიკაში და Offline აღრიცხვაში აღარ გამოჩნდება"
                    >
                      {device.isExcluded ? (
                        <ToggleRight size={24} />
                      ) : (
                        <ToggleLeft size={24} />
                      )}
                      <span>
                        {device.isExcluded ? "გამორიცხულია" : "აქტიურია"}
                      </span>
                    </button>
                    <small>რუკა/აღრიცხვა</small>
                  </div>
                  <div className="row-actions">
                    {permissions.editDevice ? (
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => startEditDevice(device)}
                        aria-label="X-Station-ის რედაქტირება"
                        title="X-Station-ის რედაქტირება"
                      >
                        <Edit3 size={17} />
                      </button>
                    ) : null}
                    {permissions.deleteDevice ? (
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => removeDevice(device.id)}
                        aria-label="X-Station-ის წაშლა"
                        title="X-Station-ის წაშლა"
                      >
                        <Trash2 size={17} />
                      </button>
                    ) : null}
                  </div>
                </article>
              ),
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function DeviceDraftFields({
  draft,
  onChange,
  regionNames,
  availableTags,
  toggleTag,
  canCreateTags,
  canDeleteTags,
  onCreateTag,
  onDeleteTag,
}: {
  draft: DeviceDraft;
  onChange: (partial: Partial<DeviceDraft>) => void;
  regionNames: string[];
  availableTags: string[];
  toggleTag: (tagName: string) => void;
  canCreateTags: boolean;
  canDeleteTags: boolean;
  onCreateTag: (tagName: string) => Promise<string | null> | string | null;
  onDeleteTag: (tagName: string) => Promise<boolean> | boolean;
}) {
  const [newTagName, setNewTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [deletingTag, setDeletingTag] = useState("");

  async function createAndAttachTag() {
    if (!canCreateTags || savingTag) {
      return;
    }

    const tagName = newTagName.trim().replace(/\s+/g, " ");
    if (!tagName) {
      return;
    }

    const existingTag = availableTags.find((tag) => tag === tagName);
    if (existingTag) {
      onChange({ tags: mergeTags(draft.tags, [existingTag]) });
      setNewTagName("");
      return;
    }

    setSavingTag(true);
    const createdTag = await onCreateTag(tagName);
    setSavingTag(false);
    if (createdTag) {
      onChange({ tags: mergeTags(draft.tags, [createdTag]) });
      setNewTagName("");
    }
  }

  function submitNewTagOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void createAndAttachTag();
  }

  async function deleteTag(tagName: string) {
    if (!canDeleteTags || deletingTag) {
      return;
    }

    setDeletingTag(tagName);
    await onDeleteTag(tagName);
    setDeletingTag("");
  }

  return (
    <>
      <label>
        <span>სახელი</span>
        <input
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="ლოკაციის დასახელება"
          required
        />
      </label>
      <div className="form-row">
        <label>
          <span>რაიონი</span>
          <select
            value={draft.region}
            onChange={(event) => onChange({ region: event.target.value })}
          >
            <option value="">რაიონის გარეშე</option>
            {regionNames.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>სტატუსი</span>
          <select
            value={draft.status}
            onChange={(event) =>
              onChange({ status: event.target.value as DeviceStatus })
            }
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="error">Error</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>Latitude</span>
          <input
            type="number"
            min={41.62}
            max={41.84}
            step={0.000001}
            value={draft.lat}
            onChange={(event) => onChange({ lat: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Longitude</span>
          <input
            type="number"
            min={44.62}
            max={45.02}
            step={0.000001}
            value={draft.lng}
            onChange={(event) => onChange({ lng: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="row-tags">
        {availableTags.map((tagName) => (
          <span key={tagName} className="tag-chip-control">
            <button
              type="button"
              className={`tag-toggle compact ${draft.tags.includes(tagName) ? "active" : ""}`}
              onClick={() => toggleTag(tagName)}
            >
              {tagName}
            </button>
            {canDeleteTags ? (
              <button
                type="button"
                className="tag-delete-button"
                onClick={() => deleteTag(tagName)}
                disabled={Boolean(deletingTag)}
                aria-label={`${tagName} ტეგის წაშლა`}
                title="ტეგის წაშლა"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      <div className="device-tag-edit-actions">
        {draft.tags.length ? (
          <button
            className="ghost-button"
            type="button"
            onClick={() => onChange({ tags: [] })}
          >
            <X size={15} />
            <span>ყველა ტეგის მოხსნა</span>
          </button>
        ) : null}
        {canCreateTags ? (
          <div className="device-tag-create">
            <input
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              onKeyDown={submitNewTagOnEnter}
              placeholder="ახალი ტეგი"
              maxLength={120}
            />
            <button
              className="ghost-button"
              type="button"
              onClick={() => void createAndAttachTag()}
              disabled={savingTag}
            >
              <Plus size={15} />
              <span>{savingTag ? "ემატება..." : "დამატება"}</span>
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function devicePayload(draft: DeviceDraft) {
  const position = clampLatLng({
    lat: Number(draft.lat),
    lng: Number(draft.lng),
  });
  return {
    name: draft.name.trim(),
    status: draft.status,
    isExcluded: draft.isExcluded,
    region: draft.region || null,
    position,
    tags: draft.tags,
  };
}

function devicePayloadFromDevice(device: Device, isExcluded = device.isExcluded) {
  return {
    name: device.name.trim(),
    status: device.status,
    isExcluded,
    region: device.region === unassignedRegion ? null : device.region,
    position: device.position,
    tags: device.tags,
  };
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function compareDevices(a: Device, b: Device, sortMode: DeviceSortMode) {
  if (sortMode === "region") {
    return (
      a.region.localeCompare(b.region, "ka") ||
      a.name.localeCompare(b.name, "ka") ||
      a.id.localeCompare(b.id, "ka")
    );
  }

  const result =
    a.name.localeCompare(b.name, "ka") || a.id.localeCompare(b.id, "ka");
  return sortMode === "za" ? -result : result;
}
