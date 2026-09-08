"use client";

import { useEffect, useState } from "react";

export type NavBadgeCounts = {
  formOne: number;
  offline: number;
};

type MonitoringNotification = { deviceId: string };

/**
 * Counts shown on the collapsed sidebar icons. Both endpoints are the same ones
 * the notifications bell polls, so a badge never shows a number the bell cannot
 * explain when it is opened.
 */
export function useNavBadges({
  canFormOne,
  canOfflineMonitor,
}: {
  canFormOne: boolean;
  canOfflineMonitor: boolean;
}): NavBadgeCounts {
  const [formOne, setFormOne] = useState(0);
  const [offline, setOffline] = useState(0);

  useEffect(() => {
    if (!canFormOne) {
      setFormOne(0);
      return;
    }

    let cancelled = false;

    async function refresh() {
      const response = await fetch("/api/form-one/notifications", {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        notifications?: unknown[];
      } | null;
      setFormOne(payload?.notifications?.length ?? 0);
    }

    void refresh();
    const id = window.setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canFormOne]);

  useEffect(() => {
    if (!canOfflineMonitor) {
      setOffline(0);
      return;
    }

    let cancelled = false;

    function handleMonitoringData(event: Event) {
      const detail = (
        event as CustomEvent<{ notifications?: MonitoringNotification[] }>
      ).detail;
      if (!cancelled) {
        setOffline(detail?.notifications?.length ?? 0);
      }
    }

    async function refresh() {
      const response = await fetch("/api/offline-records/monitoring", {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        notifications?: unknown[];
      } | null;
      setOffline(payload?.notifications?.length ?? 0);
    }

    window.addEventListener("monitoring-data", handleMonitoringData);
    void refresh();
    const id = window.setInterval(refresh, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("monitoring-data", handleMonitoringData);
    };
  }, [canOfflineMonitor]);

  return { formOne, offline };
}
