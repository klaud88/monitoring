import {
  TBILISI_CENTER,
  clampLatLng,
  percentPositionToLatLng,
  type LatLng,
} from "./geo";

export function parseDevicePosition(value: unknown): LatLng | null {
  if (!isRecord(value)) {
    return null;
  }

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return clampLatLng({ lat, lng });
  }

  const x = Number(value.x);
  const y = Number(value.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return percentPositionToLatLng({ x, y });
  }

  return null;
}

export function readDevicePosition(value: unknown): LatLng {
  return parseDevicePosition(value) ?? TBILISI_CENTER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
