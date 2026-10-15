"use client";

import { useMemo, useState } from "react";
import {
  Edit3,
  MapPinned,
  Minus,
  Plus,
  Save,
  Search,
  Tags,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Pencil,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { FiltersToggle } from "@/components/common/filters-toggle";
import { TagChipControl } from "@/components/common/tag-chip-control";
import { getGardenKey } from "@/lib/device-associations";
import { getGardenDisplayName } from "@/lib/device-options";
import { TBILISI_CENTER, clampLatLng } from "@/lib/geo";
import { mergeTags, renameTagInList } from "@/lib/tags";
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
  renameTags: boolean;
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

const deviceStatusTitles: Record<DeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  error: "შეცდომა",
};

export function RegionManager({
  initialDevices,
  initialRegions,
  initialTags,
  initialGardenTags,
  initialGardenRegions,
  permissions,
}: {
  initialDevices: Device[];
  initialRegions: Region[];
  initialTags: string[];
  /** Garden key → tags given to the whole garden. */
  initialGardenTags: Record<string, string[]>;
  /** Garden key → the garden's region; its devices follow it. */
  initialGardenRegions: Record<string, string>;
  permissions: RegionPermissions;
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [gardenTags, setGardenTags] = useState(initialGardenTags);
  const [gardenRegions, setGardenRegions] = useState(initialGardenRegions);
  const [editingGardenKey, setEditingGardenKey] = useState<string | null>(null);
  const [gardenTagDraft, setGardenTagDraft] = useState<string[]>([]);
  const [regions, setRegions] = useState(initialRegions);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deviceSort, setDeviceSort] = useState<DeviceSortMode>("az");
  const [regionFilter, setRegionFilter] = useState("all");
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [managingTags, setManagingTags] = useState(false);
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
  const [regionsOpen, setRegionsOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const { confirm, confirmationDialog } = useConfirmDialog();

  const regionNames = regions.map((region) => region.name);

  const filteredDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return devices
      .filter(
        (device) => {
          const matchesRegion =
            regionFilter === "all" || device.region === regionFilter;
          const matchesQuery =
            !normalized ||
            device.name.toLowerCase().includes(normalized) ||
            device.region.toLowerCase().includes(normalized);
          // A garden's own tags count for every device in it.
          const gardenTagNames = gardenTags[getGardenKey(device.name)] ?? [];
          const matchesTags =
            selectedFilterTags.length === 0 ||
            selectedFilterTags.every(
              (tagName) =>
                device.tags.includes(tagName) || gardenTagNames.includes(tagName),
            );

          return matchesRegion && matchesQuery && matchesTags;
        },
      )
      .sort((a, b) => compareDevices(a, b, deviceSort));
  }, [devices, deviceSort, gardenTags, query, regionFilter, selectedFilterTags]);

  // Devices are named "<garden>-<n>"; the list shows one card per garden in
  // the order its first device sorts, with that garden's devices inside.
  const gardenGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; regions: string[]; devices: Device[] }
    >();
    for (const device of filteredDevices) {
      const key = getGardenKey(device.name) || device.id;
      let group = groups.get(key);
      if (!group) {
        group = { key, label: getGardenDisplayName(device), regions: [], devices: [] };
        groups.set(key, group);
      }
      group.devices.push(device);
      if (device.region && !group.regions.includes(device.region)) {
        group.regions.push(device.region);
      }
    }
    return [...groups.values()];
  }, [filteredDevices]);

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

  function toggleFilterTag(tagName: string) {
    setSelectedFilterTags((current) => toggleListValue(current, tagName));
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
      message: `ნამდვილად გსურთ "${tagName}" ტეგის წაშლა? ტეგი ყველა მოწყობილობიდან და ბაღიდან მოიხსნება.`,
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
    setSelectedFilterTags((current) =>
      current.filter((tag) => tag !== tagName),
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
    setGardenTags((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, tags]) => [
          key,
          tags.filter((tag) => tag !== tagName),
        ]),
      ),
    );
    setGardenTagDraft((current) => current.filter((tag) => tag !== tagName));
    return true;
  }

  async function renameAvailableTag(tagName: string, newName: string) {
    if (!permissions.renameTags) {
      return false;
    }

    if (availableTags.includes(newName)) {
      const merge = await confirm({
        title: "ტეგების გაერთიანება",
        message: `ტეგი "${newName}" უკვე არსებობს. გაერთიანდეს "${tagName}" მასთან? "${tagName}" ყველა მოწყობილობასა და ბაღზე "${newName}"-ით შეიცვლება.`,
        confirmLabel: "გაერთიანება",
      });
      if (!merge) {
        return false;
      }
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/device-tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName, newName }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("ტეგის სახელის შეცვლა ვერ მოხერხდა.");
      return false;
    }

    const data = (await response.json()) as { tag?: string; tags?: string[] };
    const renamed = data.tag ?? newName;
    const swap = (tags: string[]) => renameTagInList(tags, tagName, renamed);
    setAvailableTags((current) => data.tags ?? swap(current));
    setSelectedFilterTags(swap);
    setDevices((current) =>
      current.map((device) => ({ ...device, tags: swap(device.tags) })),
    );
    setDraft((current) => ({ ...current, tags: swap(current.tags) }));
    setDeviceEdit((current) =>
      current ? { ...current, tags: swap(current.tags) } : current,
    );
    setGardenTags((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, tags]) => [key, swap(tags)]),
      ),
    );
    setGardenTagDraft(swap);
    return true;
  }

  function startGardenTags(gardenKey: string) {
    setError("");
    setEditingGardenKey(gardenKey);
    setGardenTagDraft(gardenTags[gardenKey] ?? []);
  }

  async function saveGardenTags(gardenKey: string) {
    setSaving(true);
    setError("");
    const response = await fetch("/api/garden-tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gardenKey, tags: gardenTagDraft }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("ბაღის ტეგების შენახვა ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as { tags?: string[] };
    setGardenTags((current) => ({
      ...current,
      [gardenKey]: data.tags ?? gardenTagDraft,
    }));
    setEditingGardenKey(null);
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
    setGardenRegions((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, name]) => [
          key,
          name === region.name ? data.region.name : name,
        ]),
      ),
    );
    setEditingRegionId(null);
  }

  async function removeRegion(region: Region) {
    if (!permissions.deleteRegion) {
      return;
    }

    const confirmed = await confirm({
      message:
        "ნამდვილად გსურთ აღნიშნულის წაშლა? ამ რაიონზე მიბმული მოწყობილობები დარჩებიან რაიონის გარეშე.",
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
    setGardenRegions((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, name]) => name !== region.name),
      ),
    );
  }

  async function saveGardenRegion(gardenKey: string, regionName: string) {
    setSaving(true);
    setError("");
    const response = await fetch("/api/garden-regions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gardenKey, region: regionName || null }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("ბაღის რაიონის შენახვა ვერ მოხერხდა.");
      return;
    }

    const data = (await response.json()) as {
      region: string | null;
      devices?: { id: string; region: string }[];
    };
    setGardenRegions((current) => {
      const next = { ...current };
      if (data.region) {
        next[gardenKey] = data.region;
      } else {
        delete next[gardenKey];
      }
      return next;
    });
    const regionById = new Map((data.devices ?? []).map((item) => [item.id, item.region]));
    setDevices((current) =>
      current.map((device) =>
        regionById.has(device.id)
          ? { ...device, region: regionById.get(device.id)! }
          : device,
      ),
    );
  }

  async function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.createDevice) {
      return;
    }

    const payload = devicePayload(draft);
    if (!payload.name) {
      setError("მოწყობილობის სახელი აუცილებელია.");
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
      setError("მოწყობილობის დამატება ვერ მოხერხდა.");
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
      setError("მოწყობილობის სახელი აუცილებელია.");
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
      setError("მოწყობილობის რედაქტირება ვერ მოხერხდა.");
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
      setError("მოწყობილობის ჩართვა/გამორთვა ვერ მოხერხდა.");
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
      setError("მოწყობილობის წაშლა ვერ მოხერხდა.");
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
          <p className="eyebrow">მოწყობილობები</p>
          <h1>რაიონებისა და მოწყობილობების მართვა</h1>
          <p>რაიონების, ბაღების, მოწყობილობების და მათი ტეგების მართვა.</p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <MapPinned size={18} />
            <span>{devices.length}</span>
            <small>მოწყობილობა</small>
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
          <button type="button" className="section-title" onClick={() => setRegionsOpen((o) => !o)}>
            <h2>რაიონები</h2>
            {regionsOpen ? <Minus size={20} /> : <MapPinned size={20} />}
          </button>

          {regionsOpen && permissions.createRegion ? (
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

          {regionsOpen && <div className="region-admin-list">
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
                      <small>{item.count} მოწყობილობა</small>
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
          </div>}
          </section>

          {permissions.createDevice ? (
            <form
              className="surface admin-form device-create-form"
              onSubmit={createDevice}
            >
              <button type="button" className="section-title" onClick={() => setDeviceOpen((o) => !o)}>
                <h2>ახალი მოწყობილობა</h2>
                {deviceOpen ? <Minus size={20} /> : <Plus size={20} />}
              </button>
              {deviceOpen && (
                <>
                  <DeviceDraftFields
                    draft={draft}
                    onChange={(partial) =>
                      setDraft((current) => ({ ...current, ...partial }))
                    }
                    gardenRegions={gardenRegions}
                    availableTags={availableTags}
                    toggleTag={toggleDraftTag}
                    canCreateTags={permissions.createTags}
                    canDeleteTags={permissions.deleteTags}
                    canRenameTags={permissions.renameTags}
                    onCreateTag={createAvailableTag}
                    onDeleteTag={removeAvailableTag}
                    onRenameTag={renameAvailableTag}
                  />
                  <button className="primary-button" type="submit" disabled={saving}>
                    <Plus size={18} />
                    <span>მოწყობილობის დამატება</span>
                  </button>
                </>
              )}
            </form>
          ) : null}
        </aside>

        <section className="surface">
          <div
            className="table-toolbar"
            data-filters-open={filtersOpen ? "true" : "false"}
          >
            <div className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ძებნა სახელით ან რაიონით"
              />
            </div>
            <FiltersToggle
              open={filtersOpen}
              count={
                (regionFilter === "all" ? 0 : 1) + selectedFilterTags.length
              }
              onToggle={() => setFiltersOpen((current) => !current)}
            />
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

          {availableTags.length ? (
            <section
              className="tag-filter region-device-tag-filter"
              aria-label="ტეგების ფილტრი"
            >
              {availableTags.map((tagName) =>
                managingTags ? (
                  <TagChipControl
                    key={tagName}
                    name={tagName}
                    showIcon
                    selected={selectedFilterTags.includes(tagName)}
                    onToggle={() => toggleFilterTag(tagName)}
                    onRename={
                      permissions.renameTags
                        ? (newName) => renameAvailableTag(tagName, newName)
                        : undefined
                    }
                    onDelete={
                      permissions.deleteTags
                        ? () => void removeAvailableTag(tagName)
                        : undefined
                    }
                    busy={saving}
                  />
                ) : (
                  <button
                    key={tagName}
                    className={`tag-toggle ${selectedFilterTags.includes(tagName) ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleFilterTag(tagName)}
                  >
                    <Tags size={14} />
                    <span>{tagName}</span>
                  </button>
                ),
              )}
              {permissions.renameTags || permissions.deleteTags ? (
                <button
                  type="button"
                  className={`tag-manage-toggle${managingTags ? " active" : ""}`}
                  aria-pressed={managingTags}
                  onClick={() => setManagingTags((current) => !current)}
                >
                  <Pencil size={13} />
                  <span>{managingTags ? "მზადაა" : "ტეგების მართვა"}</span>
                </button>
              ) : null}
              {selectedFilterTags.length ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setSelectedFilterTags([])}
                >
                  <X size={16} />
                  <span>გასუფთავება</span>
                </button>
              ) : null}
            </section>
          ) : null}

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

          <div className="garden-totals" aria-live="polite">
            <span>
              ბაღები <strong>{gardenGroups.length}</strong>
            </span>
            <span>
              მოწყობილობები <strong>{filteredDevices.length}</strong>
            </span>
          </div>

          <div className="region-device-list">
            {gardenGroups.map((group) => (
              <article key={group.key} className="garden-group">
                <div className="garden-group-head">
                  <div className="garden-group-title">
                    <strong>{group.label}</strong>
                    {/* The garden owns the region; its devices follow it. */}
                    {permissions.editDevice ? (
                      <select
                        className="garden-region-select"
                        value={gardenRegions[group.key] ?? ""}
                        onChange={(event) =>
                          saveGardenRegion(group.key, event.target.value)
                        }
                        disabled={saving}
                        aria-label={`${group.label} — რაიონი`}
                      >
                        <option value="">რაიონის გარეშე</option>
                        {regionNames.map((region) => (
                          <option key={region} value={region}>
                            {region}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{gardenRegions[group.key] ?? "რაიონის გარეშე"}</span>
                    )}
                  </div>
                </div>
                {/* The garden's own tags: a column on the right of the card. */}
                <div className="garden-group-tags">
                  {(gardenTags[group.key] ?? []).map((tagName) => (
                    <span key={tagName} className="garden-tag-chip">
                      <Tags size={12} />
                      {tagName}
                    </span>
                  ))}
                  {permissions.editDevice && editingGardenKey !== group.key ? (
                    <button
                      type="button"
                      className="garden-tag-edit"
                      onClick={() => startGardenTags(group.key)}
                      aria-label={`${group.label} — ბაღის ტეგები`}
                      title="ბაღის ტეგები"
                    >
                      <Edit3 size={13} />
                      {(gardenTags[group.key] ?? []).length ? null : (
                        <span>ტეგი</span>
                      )}
                    </button>
                  ) : null}
                </div>
                {editingGardenKey === group.key ? (
                  <div className="garden-tag-panel">
                    <span className="garden-tag-panel-label">
                      ბაღის ტეგები — {group.label}
                    </span>
                    <div className="row-tags">
                      {availableTags.length ? (
                        availableTags.map((tagName) => (
                          <TagChipControl
                            key={tagName}
                            name={tagName}
                            selected={gardenTagDraft.includes(tagName)}
                            onToggle={() =>
                              setGardenTagDraft((current) =>
                                toggleListValue(current, tagName),
                              )
                            }
                            onRename={
                              permissions.renameTags
                                ? (newName) => renameAvailableTag(tagName, newName)
                                : undefined
                            }
                            onDelete={
                              permissions.deleteTags
                                ? () => void removeAvailableTag(tagName)
                                : undefined
                            }
                            busy={saving}
                          />
                        ))
                      ) : (
                        <span className="muted">
                          ტეგები ჯერ არ არის. დაამატე ზემოთ „ტეგის დამატებით“.
                        </span>
                      )}
                    </div>
                    <div className="row-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => saveGardenTags(group.key)}
                        disabled={saving}
                      >
                        <Save size={15} />
                        <span>შენახვა</span>
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setEditingGardenKey(null)}
                        disabled={saving}
                      >
                        <X size={15} />
                        <span>გაუქმება</span>
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="garden-group-devices">
                  {group.devices.map((device) =>
                    editingDeviceId === device.id && deviceEdit ? (
                      <div key={device.id} className="region-device-row editing">
                        <DeviceDraftFields
                          draft={deviceEdit}
                          onChange={(partial) =>
                            setDeviceEdit((current) =>
                              current ? { ...current, ...partial } : current,
                            )
                          }
                          gardenRegions={gardenRegions}
                          availableTags={availableTags}
                          toggleTag={toggleEditTag}
                          canCreateTags={permissions.createTags}
                          canDeleteTags={permissions.deleteTags}
                          canRenameTags={permissions.renameTags}
                          onCreateTag={createAvailableTag}
                          onDeleteTag={removeAvailableTag}
                          onRenameTag={renameAvailableTag}
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
                      </div>
                    ) : (
                      <div key={device.id} className="region-device-row">
                        <div>
                          <span
                            className={`garden-device-chip ${device.status}`}
                            title={deviceStatusTitles[device.status]}
                          >
                            {device.name}
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
                            title="ჩართვისას მოწყობილობა რუკაზე, ანალიტიკაში და Offline აღრიცხვაში აღარ გამოჩნდება"
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
                              aria-label="მოწყობილობის რედაქტირება"
                              title="მოწყობილობის რედაქტირება"
                            >
                              <Edit3 size={17} />
                            </button>
                          ) : null}
                          {permissions.deleteDevice ? (
                            <button
                              className="icon-button danger"
                              type="button"
                              onClick={() => removeDevice(device.id)}
                              aria-label="მოწყობილობის წაშლა"
                              title="მოწყობილობის წაშლა"
                            >
                              <Trash2 size={17} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function DeviceDraftFields({
  draft,
  onChange,
  gardenRegions,
  availableTags,
  toggleTag,
  canCreateTags,
  canDeleteTags,
  canRenameTags,
  onCreateTag,
  onDeleteTag,
  onRenameTag,
}: {
  draft: DeviceDraft;
  onChange: (partial: Partial<DeviceDraft>) => void;
  /** Garden key → region; shown read-only, the garden decides it. */
  gardenRegions: Record<string, string>;
  availableTags: string[];
  toggleTag: (tagName: string) => void;
  canCreateTags: boolean;
  canDeleteTags: boolean;
  canRenameTags: boolean;
  onCreateTag: (tagName: string) => Promise<string | null> | string | null;
  onDeleteTag: (tagName: string) => Promise<boolean> | boolean;
  onRenameTag: (tagName: string, newName: string) => Promise<boolean> | boolean;
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
          <span>რაიონი (ბაღიდან)</span>
          <input
            value={
              getGardenKey(draft.name)
                ? (gardenRegions[getGardenKey(draft.name)] ?? "რაიონის გარეშე")
                : "—"
            }
            readOnly
            disabled
            title="რაიონი ბაღზე იცვლება: მოწყობილობა თავისი ბაღის რაიონშია"
          />
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
          <TagChipControl
            key={tagName}
            name={tagName}
            selected={draft.tags.includes(tagName)}
            onToggle={() => toggleTag(tagName)}
            onRename={
              canRenameTags ? (newName) => onRenameTag(tagName, newName) : undefined
            }
            onDelete={canDeleteTags ? () => void deleteTag(tagName) : undefined}
            busy={Boolean(deletingTag)}
          />
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
      a.region.localeCompare(b.region) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      a.id.localeCompare(b.id)
    );
  }

  const result =
    a.name.localeCompare(b.name, undefined, { numeric: true }) ||
    a.id.localeCompare(b.id);
  return sortMode === "za" ? -result : result;
}
