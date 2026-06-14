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
