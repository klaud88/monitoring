import type { Device } from "./types";

const deviceNameCollator = new Intl.Collator("ka-GE", {
  numeric: true,
  sensitivity: "base",
});

export function sortDevicesByName<T extends Pick<Device, "id" | "name">>(
  devices: T[],
) {
  return [...devices].sort(
    (a, b) =>
      deviceNameCollator.compare(a.name, b.name) ||
      a.id.localeCompare(b.id),
  );
}

export function findDeviceByName<T extends Pick<Device, "name">>(
  devices: T[],
  name: string,
) {
  const normalizedName = normalizeDeviceName(name);
  return devices.find(
    (device) => normalizeDeviceName(device.name) === normalizedName,
  );
}

function normalizeDeviceName(value: string) {
  return value.trim().toLocaleLowerCase("ka-GE");
}

export type GardenOption = { code: string; label: string; deviceId: string };

/** Device names follow "<garden>-<device>" (e.g. "34-2"), garden-only
 *  ("105"), or occasionally free text ("Suprema test") — this extracts just
 *  the garden number, falling back to the original value when nothing
 *  numeric is found. Same logic already used in problem-reports-manager.tsx
 *  and form-one-manager.tsx; kept here as the shared, canonical version. */
export function normalizeGardenCode(value?: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const firstPart = trimmed.split("-")[0]?.trim();
  if (firstPart && /^\d+$/.test(firstPart)) {
    return firstPart;
  }

  return trimmed.match(/\d+/)?.[0] || firstPart || trimmed;
}

export function getGardenCode(device: Pick<Device, "code" | "name">): string {
  const name = String(device.name || "").trim();
  return normalizeGardenCode(name) || normalizeGardenCode(device.code);
}

export function getGardenDisplayName(device: Pick<Device, "code" | "name">): string {
  return getGardenCode(device) || device.name;
}

/** One entry per garden — the kept deviceId is just a representative device
 *  for that garden, so a picker built from this never shows the same garden
 *  twice even when it has several physical devices. */
export function buildGardenOptions<
  T extends Pick<Device, "id" | "code" | "name"> & { deletedAt?: string },
>(
  devices: T[],
): GardenOption[] {
  const options = new Map<string, GardenOption>();

  devices.forEach((device) => {
    const code = getGardenCode(device);
    // Deleted gardens keep their name on old records but can't be picked.
    if (!code || options.has(code) || device.deletedAt) {
      return;
    }

    options.set(code, {
      code,
      label: getGardenDisplayName(device),
      deviceId: device.id,
    });
  });

  return [...options.values()];
}

/** datalist-driven pickers resolve typed text back to an id by exact match
 *  — this is the garden-label equivalent of findDeviceByName. */
export function findGardenOptionByLabel(
  options: GardenOption[],
  label: string,
): GardenOption | undefined {
  const normalized = normalizeDeviceName(label);
  return options.find((option) => normalizeDeviceName(option.label) === normalized);
}
