import type { Device } from "./types";

/**
 * Devices are named `<garden>-<n>` — "34-1", "34-2", "34-3" all sit in garden
 * 34. Everything before the first dash is the garden; a name without a dash is
 * its own garden.
 */
export function getGardenKey(name: string) {
  const trimmed = name.trim();
  const dashIndex = trimmed.indexOf("-");
  const key = dashIndex === -1 ? trimmed : trimmed.slice(0, dashIndex);
  return key.trim().toLocaleLowerCase();
}

/** The other devices of the same garden, derived from their names. */
export function findSiblingDevices(device: Device, devices: Device[]) {
  const key = getGardenKey(device.name);
  if (!key) {
    return [];
  }

  return devices
    .filter(
      (candidate) =>
        candidate.id !== device.id && getGardenKey(candidate.name) === key,
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ka"));
}

/**
 * Manual links that the sibling rule does not already cover, so a name is
 * never listed twice.
 */
export function getExtraAssociations(device: Device, siblings: Device[]) {
  const covered = new Set(
    [device, ...siblings].map((item) => item.name.trim().toLocaleLowerCase()),
  );

  return device.associatedDevices.filter(
    (name) => !covered.has(name.trim().toLocaleLowerCase()),
  );
}
