export type LatLng = {
  lat: number;
  lng: number;
};

export const TBILISI_CENTER: LatLng = { lat: 41.7151, lng: 44.8271 };

export const TBILISI_BOUNDS = {
  north: 41.84,
  south: 41.62,
  west: 44.62,
  east: 45.02,
};

export function clampLatLng(location: LatLng): LatLng {
  return roundLatLng({
    lat: clampNumber(location.lat, TBILISI_BOUNDS.south, TBILISI_BOUNDS.north, TBILISI_CENTER.lat),
    lng: clampNumber(location.lng, TBILISI_BOUNDS.west, TBILISI_BOUNDS.east, TBILISI_CENTER.lng),
  });
}

export function percentPositionToLatLng(position: { x: number; y: number }): LatLng {
  const x = clampNumber(position.x, 5, 95, 50);
  const y = clampNumber(position.y, 5, 95, 50);
  const lng = TBILISI_BOUNDS.west + (x / 100) * (TBILISI_BOUNDS.east - TBILISI_BOUNDS.west);
  const lat = TBILISI_BOUNDS.north - (y / 100) * (TBILISI_BOUNDS.north - TBILISI_BOUNDS.south);

  return clampLatLng({ lat, lng });
}

function roundLatLng(location: LatLng): LatLng {
  return {
    lat: Math.round(location.lat * 1_000_000) / 1_000_000,
    lng: Math.round(location.lng * 1_000_000) / 1_000_000,
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, safeValue));
}
