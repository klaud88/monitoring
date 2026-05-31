"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Move,
  Pencil,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { AppUser, Device, Task } from "@/lib/types";

export type LatLng = {
  lat: number;
  lng: number;
};

type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

type GooglePoint = {
  x: number;
  y: number;
};

type GoogleMapsEventListener = {
  remove: () => void;
};

type GoogleMap = {
  setOptions: (options: Record<string, unknown>) => void;
  addListener: (eventName: string, handler: () => void) => GoogleMapsEventListener;
};

type GoogleMapProjection = {
  fromLatLngToDivPixel: (latLng: GoogleLatLng) => GooglePoint | null;
  fromContainerPixelToLatLng: (point: GooglePoint) => GoogleLatLng | null;
};

type GoogleMapPanes = {
  overlayMouseTarget: HTMLElement;
};

type GoogleOverlayView = {
  setMap: (map: GoogleMap | null) => void;
  getPanes: () => GoogleMapPanes | null;
  getProjection: () => GoogleMapProjection | null;
  onAdd: () => void;
  draw: () => void;
  onRemove: () => void;
};

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    LatLng: new (lat: number, lng: number) => GoogleLatLng;
    Point: new (x: number, y: number) => GooglePoint;
    OverlayView: new () => GoogleOverlayView;
  };
};

type MarkerOverlay = {
  render: (children: ReactNode) => void;
  remove: () => void;
  setPosition: (position: LatLng) => void;
};

type Props = {
  devices: Device[];
  deviceLocations: Record<string, LatLng>;
  tasksByDevice: Map<string, Task[]>;
  userMap: Map<string, AppUser>;
  activeAssignment: { deviceId: string; taskId: string; userId: string } | null;
  selectedDeviceId: string | null;
  editingDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onCloseDevice: () => void;
  onStartEdit: (deviceId: string) => void;
  onStopEdit: (deviceId: string) => void;
  onMove: (deviceId: string, location: LatLng) => void;
  onShowAssignment: (deviceId: string, taskId: string, userId: string) => void;
  onCloseAssignment: () => void;
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __googleMapsPromise?: Promise<GoogleMapsApi>;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js";
const TBILISI_CENTER: LatLng = { lat: 41.7151, lng: 44.8271 };
const TBILISI_BOUNDS = {
  north: 41.84,
  south: 41.62,
  west: 44.62,
  east: 45.02
};

export function GoogleTbilisiMap({
  devices,
  deviceLocations,
  tasksByDevice,
  userMap,
  activeAssignment,
  selectedDeviceId,
  editingDeviceId,
  onSelect,
  onCloseDevice,
  onStartEdit,
  onStopEdit,
  onMove,
  onShowAssignment,
  onCloseAssignment
}: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const mapsRef = useRef<GoogleMapsApi["maps"] | null>(null);
  const projectionOverlayRef = useRef<GoogleOverlayView | null>(null);
  const overlaysRef = useRef<Map<string, MarkerOverlay>>(new Map());
  const listenersRef = useRef<GoogleMapsEventListener[]>([]);
  const onCloseDeviceRef = useRef(onCloseDevice);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

  useEffect(() => {
    onCloseDeviceRef.current = onCloseDevice;
  }, [onCloseDevice]);

  useEffect(() => {
    if (!apiKey) {
      setMapError("Google Maps API key არ არის მითითებული.");
      return;
    }

    let cancelled = false;
    const overlays = overlaysRef.current;

    loadGoogleMaps(apiKey)
      .then((googleApi) => {
        if (cancelled || !mapElementRef.current) {
          return;
        }

        const mapOptions: Record<string, unknown> = {
          center: TBILISI_CENTER,
          zoom: 12,
          minZoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          restriction: {
            latLngBounds: {
              north: 42.02,
              south: 41.52,
              west: 44.45,
              east: 45.18
            },
            strictBounds: false
          }
        };

        if (mapId) {
          mapOptions.mapId = mapId;
        } else {
          mapOptions.styles = mapStyles;
        }

        const map = new googleApi.maps.Map(mapElementRef.current, mapOptions);
        const projectionOverlay = new googleApi.maps.OverlayView();
        projectionOverlay.onAdd = () => undefined;
        projectionOverlay.draw = () => undefined;
        projectionOverlay.onRemove = () => undefined;
        projectionOverlay.setMap(map);

        mapRef.current = map;
        mapsRef.current = googleApi.maps;
        projectionOverlayRef.current = projectionOverlay;
        listenersRef.current = [map.addListener("click", () => onCloseDeviceRef.current())];
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError("Google Maps ვერ ჩაიტვირთა.");
        }
      });

    return () => {
      cancelled = true;
      listenersRef.current.forEach((listener) => listener.remove());
      listenersRef.current = [];
      overlays.forEach((overlay) => overlay.remove());
      overlays.clear();
      projectionOverlayRef.current?.setMap(null);
      projectionOverlayRef.current = null;
      mapRef.current = null;
      mapsRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, mapId]);

  useEffect(() => {
    mapRef.current?.setOptions({
      draggable: !editingDeviceId,
      scrollwheel: !editingDeviceId
    });
  }, [editingDeviceId]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!mapReady || !map || !maps) {
      return;
    }

    const activeDeviceIds = new Set(devices.map((device) => device.id));
    overlaysRef.current.forEach((overlay, deviceId) => {
      if (!activeDeviceIds.has(deviceId)) {
        overlay.remove();
        overlaysRef.current.delete(deviceId);
      }
    });

    devices.forEach((device) => {
      const location = deviceLocations[device.id] ?? positionToLatLng(device.position);
      let overlay = overlaysRef.current.get(device.id);

      if (!overlay) {
        overlay = createMarkerOverlay({
          maps,
          map,
          position: location
        });
        overlaysRef.current.set(device.id, overlay);
      }

      overlay.setPosition(location);
      overlay.render(
        <MapDeviceMarker
          device={device}
          location={location}
          tasks={tasksByDevice.get(device.id) ?? []}
          userMap={userMap}
          activeAssignment={activeAssignment}
          isSelected={selectedDeviceId === device.id}
          isEditing={editingDeviceId === device.id}
          onSelect={onSelect}
          onCloseDevice={onCloseDevice}
          onStartEdit={onStartEdit}
          onStopEdit={onStopEdit}
          onMove={(clientX, clientY) => {
            const nextLocation = clientPointToLatLng(clientX, clientY, mapElementRef.current, maps, projectionOverlayRef.current);
            if (nextLocation) {
              onMove(device.id, nextLocation);
            }
          }}
          onShowAssignment={onShowAssignment}
          onCloseAssignment={onCloseAssignment}
        />
      );
    });
  }, [
    activeAssignment,
    deviceLocations,
    devices,
    editingDeviceId,
    mapReady,
    onCloseAssignment,
    onCloseDevice,
    onMove,
    onSelect,
    onShowAssignment,
    onStartEdit,
    onStopEdit,
    selectedDeviceId,
    tasksByDevice,
    userMap
  ]);

  return (
    <div className="map-canvas">
      <div ref={mapElementRef} className="google-map-canvas" />
      <div className="map-mode-badge">
        {editingDeviceId ? (
          <>
            <Move size={15} />
            <span>ლოკაციის ედიტი ჩართულია</span>
          </>
        ) : (
          <span>Google Maps · თბილისი</span>
        )}
      </div>
      {mapError ? (
        <div className="map-load-state" role="status">
          {mapError}
        </div>
      ) : null}
    </div>
  );
}

export function positionToLatLng(position: Device["position"]): LatLng {
  const lng = TBILISI_BOUNDS.west + (position.x / 100) * (TBILISI_BOUNDS.east - TBILISI_BOUNDS.west);
  const lat = TBILISI_BOUNDS.north - (position.y / 100) * (TBILISI_BOUNDS.north - TBILISI_BOUNDS.south);
  return roundLatLng({ lat, lng });
}

export function isLatLng(value: unknown): value is LatLng {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LatLng).lat === "number" &&
    typeof (value as LatLng).lng === "number" &&
    Number.isFinite((value as LatLng).lat) &&
    Number.isFinite((value as LatLng).lng)
  );
}

function MapDeviceMarker({
  device,
  location,
  tasks,
  userMap,
  activeAssignment,
  isSelected,
  isEditing,
  onSelect,
  onCloseDevice,
  onStartEdit,
  onStopEdit,
  onMove,
  onShowAssignment,
  onCloseAssignment
}: {
  device: Device;
  location: LatLng;
  tasks: Task[];
  userMap: Map<string, AppUser>;
  activeAssignment: { deviceId: string; taskId: string; userId: string } | null;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: (deviceId: string) => void;
  onCloseDevice: () => void;
  onStartEdit: (deviceId: string) => void;
  onStopEdit: (deviceId: string) => void;
  onMove: (clientX: number, clientY: number) => void;
  onShowAssignment: (deviceId: string, taskId: string, userId: string) => void;
  onCloseAssignment: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const assignments = tasks.flatMap((task) =>
    task.assigneeIds.map((userId) => ({
      task,
      user: userMap.get(userId)
    }))
  );
  const activeTask = activeAssignment
    ? assignments.find(
        (assignment) =>
          assignment.task.id === activeAssignment.taskId &&
          assignment.user?.id === activeAssignment.userId
      )
    : null;

  return (
    <div
      className={`device-marker ${device.status} ${isSelected ? "selected" : ""} ${isEditing ? "editing" : ""}`}
      onPointerDown={(event) => {
        if (!isEditing) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        onMove(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (isEditing && dragging) {
          event.preventDefault();
          event.stopPropagation();
          onMove(event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (!isEditing) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {assignments.length ? (
        <div className="assignment-ring" aria-label="დაგეგმილი მომხმარებლები">
          {assignments.map(({ task, user }) =>
            user ? (
              <button
                key={`${task.id}-${user.id}`}
                type="button"
                className="avatar"
                style={{ backgroundColor: user.color }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onShowAssignment(device.id, task.id, user.id);
                }}
                title={`${user.name} · ${task.title}`}
              >
                {user.initials}
              </button>
            ) : null
          )}
        </div>
      ) : null}

      <button
        className="pin-shell"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(device.id);
        }}
      >
        {device.status === "online" ? (
          <Wifi size={16} />
        ) : device.status === "error" ? (
          <AlertTriangle size={16} />
        ) : (
          <WifiOff size={16} />
        )}
        <span className="device-code">{device.name}</span>
      </button>

      {isSelected ? (
        <div className="device-popover" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={onCloseDevice} aria-label="დახურვა">
            ×
          </button>
          <strong>{device.name}</strong>
          <span className="device-region">რეგიონი: {device.region}</span>
          <small>
            Lat {location.lat.toFixed(6)} · Lng {location.lng.toFixed(6)}
          </small>
          <div className="popover-actions">
            <Link href={`/devices/${device.id}`}>
              <ExternalLink size={15} />
              <span>დეტალურად</span>
            </Link>
            {isEditing ? (
              <button type="button" onClick={() => onStopEdit(device.id)}>
                <Check size={15} />
                <span>დასრულება</span>
              </button>
            ) : (
              <button type="button" onClick={() => onStartEdit(device.id)}>
                <Pencil size={15} />
                <span>ედიტი</span>
              </button>
            )}
          </div>
          {isEditing ? <p>გადაათრიეთ პინი ახალ ადგილზე.</p> : null}
        </div>
      ) : null}

      {activeTask ? (
        <div className="assignment-popover" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={onCloseAssignment} aria-label="დახურვა">
            ×
          </button>
          <strong>{activeTask.user?.name}</strong>
          <span>{activeTask.task.title}</span>
          <p>{activeTask.task.issue}</p>
        </div>
      ) : null}
    </div>
  );
}

function createMarkerOverlay({
  maps,
  map,
  position
}: {
  maps: GoogleMapsApi["maps"];
  map: GoogleMap;
  position: LatLng;
}): MarkerOverlay {
  let currentPosition = position;
  const container = document.createElement("div");
  const root = createRoot(container);
  const overlay = new maps.OverlayView();

  container.className = "map-marker-overlay";

  overlay.onAdd = () => {
    overlay.getPanes()?.overlayMouseTarget.appendChild(container);
  };

  overlay.draw = () => {
    const projection = overlay.getProjection();
    if (!projection) {
      return;
    }

    const point = projection.fromLatLngToDivPixel(new maps.LatLng(currentPosition.lat, currentPosition.lng));
    if (!point) {
      return;
    }

    container.style.transform = `translate(${point.x}px, ${point.y}px)`;
  };

  overlay.onRemove = () => {
    root.unmount();
    container.remove();
  };

  overlay.setMap(map);

  return {
    render(children) {
      root.render(children);
    },
    remove() {
      overlay.setMap(null);
    },
    setPosition(nextPosition) {
      currentPosition = nextPosition;
      overlay.draw();
    }
  };
}

function clientPointToLatLng(
  clientX: number,
  clientY: number,
  mapElement: HTMLElement | null,
  maps: GoogleMapsApi["maps"],
  projectionOverlay: GoogleOverlayView | null
) {
  const projection = projectionOverlay?.getProjection();
  if (!mapElement || !projection) {
    return null;
  }

  const rect = mapElement.getBoundingClientRect();
  const latLng = projection.fromContainerPixelToLatLng(
    new maps.Point(clientX - rect.left, clientY - rect.top)
  );

  if (!latLng) {
    return null;
  }

  return roundLatLng({
    lat: latLng.lat(),
    lng: latLng.lng()
  });
}

function roundLatLng(location: LatLng): LatLng {
  return {
    lat: Math.round(location.lat * 1_000_000) / 1_000_000,
    lng: Math.round(location.lng * 1_000_000) / 1_000_000
  };
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (window.__googleMapsPromise) {
    return window.__googleMapsPromise;
  }

  window.__googleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps) {
          resolve(window.google);
        }
      });
      existingScript.addEventListener("error", reject);
      return;
    }

    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      language: "ka",
      region: "GE"
    });
    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps API unavailable"));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window.__googleMapsPromise;
}

const mapStyles = [
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "transit",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }]
  }
];
