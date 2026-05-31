"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPinned, Plus, Save, Search, Tags } from "lucide-react";
import { recordAudit } from "@/lib/client-audit";
import { regions, tagCatalog } from "@/lib/mock-data";
import { mergeTags, TAG_STORAGE_KEY } from "@/lib/tags";
import type { Device, DeviceStatus } from "@/lib/types";

type DeviceDraft = {
  code: string;
  name: string;
  region: string;
  status: DeviceStatus;
  x: number;
  y: number;
  tags: string[];
};

export function RegionManager({
  initialDevices,
}: {
  initialDevices: Device[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [query, setQuery] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>(() =>
    mergeTags(
      [...tagCatalog],
      initialDevices.flatMap((device) => device.tags),
    ),
  );
  const [newTagName, setNewTagName] = useState("");
  const [draft, setDraft] = useState<DeviceDraft>({
    code: "",
    name: "",
    region: regions[0],
    status: "online" as DeviceStatus,
    x: 50,
    y: 50,
    tags: [] as string[],
  });

  const filteredDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return devices.filter(
      (device) =>
        !normalized ||
        device.id.toLowerCase().includes(normalized) ||
        device.code.toLowerCase().includes(normalized) ||
        device.name.toLowerCase().includes(normalized) ||
        device.region.toLowerCase().includes(normalized),
    );
  }, [devices, query]);

  useEffect(() => {
    const storedTags = JSON.parse(
      window.localStorage.getItem(TAG_STORAGE_KEY) || "[]",
    );
    if (Array.isArray(storedTags)) {
      setAvailableTags((current) => mergeTags(current, storedTags.map(String)));
    }
  }, []);

  function persistTags(tags: string[]) {
    window.localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(tags));
  }

  function updateRegion(deviceId: string, region: string) {
    setDevices((current) =>
      current.map((device) =>
        device.id === deviceId ? { ...device, region } : device,
      ),
    );
    recordAudit("device.region_update", "device", deviceId, { region });
  }

  function toggleTag(deviceId: string, tagName: string) {
    setDevices((current) =>
      current.map((device) => {
        if (device.id !== deviceId) {
          return device;
        }

        const tags = device.tags.includes(tagName)
          ? device.tags.filter((tag) => tag !== tagName)
          : [...device.tags, tagName];

        recordAudit("device.tag_update", "device", deviceId, { tags });
        return { ...device, tags };
      }),
    );
  }

  function toggleDraftTag(tagName: string) {
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tagName)
        ? current.tags.filter((tag) => tag !== tagName)
        : [...current.tags, tagName],
    }));
  }

  function createTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const tagName = newTagName.trim();
    if (!tagName || availableTags.includes(tagName)) {
      setNewTagName("");
      return;
    }

    const nextTags = mergeTags(availableTags, [tagName]);
    setAvailableTags(nextTags);
    persistTags(nextTags);
    setNewTagName("");
    recordAudit("tag.create", "tag", tagName, { tagName });
  }

  function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const device: Device = {
      id: `dev-local-${Date.now()}`,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      status: draft.status,
      region: draft.region,
      tags: draft.tags,
      position: {
        x: Math.max(5, Math.min(95, Number(draft.x))),
        y: Math.max(5, Math.min(95, Number(draft.y))),
      },
      lastSeenAt: new Date().toISOString(),
      associatedDevices: [],
      problems: [],
      statusEvents: [],
    };

    if (!device.code || !device.name) {
      return;
    }

    setDevices((current) => [device, ...current]);
    setDraft({
      code: "",
      name: "",
      region: draft.region,
      status: "online",
      x: 50,
      y: 50,
      tags: [],
    });
    recordAudit("device.create", "device", device.id, {
      code: device.code,
      region: device.region,
      tags: device.tags,
    });
  }

  const regionSummary = regions.map((region) => ({
    region,
    count: devices.filter((device) => device.region === region).length,
  }));

  return (
    <div className="regions-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">X-Stations</p>
          <h1>რეგიონებისა და ტეგების მინიჭება</h1>
          <p>
            დავაისის რეგიონის შეცვლა და ფილტრაციისთვის საჭირო ტეგების მართვა.
          </p>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <MapPinned size={18} />
            <span>{devices.length}</span>
            <small>დავაისი</small>
          </div>
          <div className="metric">
            <Tags size={18} />
            <span>{availableTags.length}</span>
            <small>ტეგი</small>
          </div>
        </div>
      </section>

      <section className="content-grid region-grid">
        <aside className="surface">
          <div className="section-title">
            <h2>რეგიონები</h2>
            <MapPinned size={20} />
          </div>
          <div className="summary-bars">
            {regionSummary.map((item) => (
              <div key={item.region} className="summary-bar">
                <div>
                  <strong>{item.region}</strong>
                  <span>{item.count}</span>
                </div>
                <progress value={item.count} max={devices.length || 1} />
              </div>
            ))}
          </div>
        </aside>

        <form
          className="surface admin-form device-create-form"
          onSubmit={createDevice}
        >
          <div className="section-title">
            <h2>ახალი X-Station</h2>
            <Plus size={20} />
          </div>
          <div className="form-row">
            <label>
              <span>ნომერი</span>
              <input
                value={draft.code}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                placeholder="TB-601"
                required
              />
            </label>
            <label>
              <span>სახელი</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="ლოკაციის დასახელება"
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>რეგიონი</span>
              <select
                value={draft.region}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    region: event.target.value,
                  }))
                }
              >
                {regions.map((region) => (
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
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as DeviceStatus,
                  }))
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
              <span>რუკაზე X %</span>
              <input
                type="number"
                min={5}
                max={95}
                value={draft.x}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    x: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>რუკაზე Y %</span>
              <input
                type="number"
                min={5}
                max={95}
                value={draft.y}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    y: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
          <div className="row-tags">
            {availableTags.map((tagName) => (
              <button
                key={tagName}
                type="button"
                className={`tag-toggle compact ${draft.tags.includes(tagName) ? "active" : ""}`}
                onClick={() => toggleDraftTag(tagName)}
              >
                {tagName}
              </button>
            ))}
          </div>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            <span>დავაისის დამატება</span>
          </button>
        </form>

        <section className="surface">
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ძებნა დავაისით ან რეგიონით"
              />
            </div>
            <button className="ghost-button" type="button">
              <Save size={16} />
              <span>ავტოშენახვა</span>
            </button>
          </div>

          <form className="tag-create-form" onSubmit={createTag}>
            <div className="search-field">
              <Tags size={18} />
              <input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="ახალი ტეგი"
              />
            </div>
            <button className="primary-button" type="submit">
              <Plus size={18} />
              <span>ტეგის დამატება</span>
            </button>
          </form>

          <div className="region-device-list">
            {filteredDevices.map((device) => (
              <article key={device.id} className="region-device-row">
                <div>
                  <strong>{device.name}</strong>
                  <span>{device.id}</span>
                </div>
                <label>
                  <span>რეგიონი</span>
                  <select
                    value={device.region}
                    onChange={(event) =>
                      updateRegion(device.id, event.target.value)
                    }
                  >
                    {regions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row-tags">
                  {availableTags.map((tagName) => (
                    <button
                      key={tagName}
                      type="button"
                      className={`tag-toggle compact ${device.tags.includes(tagName) ? "active" : ""}`}
                      onClick={() => toggleTag(device.id, tagName)}
                    >
                      {tagName}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
