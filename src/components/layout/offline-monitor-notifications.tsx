"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, WifiOff, X } from "lucide-react";

type MonitoringNotification = {
  deviceId: string;
  deviceName: string;
  offlineCount: number;
  lastOfflineAt?: string;
  lastNotificationAt?: string;
};

type AlarmHandle = {
  context: AudioContext;
  intervalId: number;
  timeoutIds: number[];
  stopTimeoutId?: number;
};

const seenStorageKey = "offline-monitor-seen-notifications";

export function OfflineMonitorNotifications() {
  const [notifications, setNotifications] = useState<MonitoringNotification[]>(
    [],
  );
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);
  const seenKeys = useRef<Set<string>>(new Set());
  const alarm = useRef<AlarmHandle | null>(null);

  useEffect(() => {
    seenKeys.current = readSeenKeys();

    let cancelled = false;
    async function refreshNotifications() {
      const response = await fetch("/api/offline-records/monitoring", {
        cache: "no-store",
      }).catch(() => null);

      if (!response?.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as {
        notifications?: MonitoringNotification[];
      };
      const nextNotifications = payload.notifications ?? [];
      const nextHasUnseen = nextNotifications.some(
        (notification) =>
          !seenKeys.current.has(getNotificationKey(notification)),
      );

      setNotifications(nextNotifications);
      setHasUnseen(nextHasUnseen);

      if (nextHasUnseen) {
        startAlarm();
      } else {
        stopAlarm();
      }
    }

    void refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      stopAlarm();
    };
  }, []);

  function openPanel() {
    setOpen(true);
    markNotificationsSeen(notifications);
  }

  function togglePanel() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      markNotificationsSeen(notifications);
    }
  }

  function markNotificationsSeen(items: MonitoringNotification[]) {
    if (!items.length) {
      setHasUnseen(false);
      stopAlarm();
      return;
    }

    items.forEach((notification) => {
      seenKeys.current.add(getNotificationKey(notification));
    });
    persistSeenKeys(seenKeys.current);
    setHasUnseen(false);
    stopAlarm();
  }

  function startAlarm() {
    if (alarm.current || typeof window === "undefined") {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    const context = new AudioContextConstructor();
    const timeoutIds: number[] = [];
    const playTone = (
      frequency: number,
      delayMs: number,
      durationMs: number,
    ) => {
      const timeoutId = window.setTimeout(() => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.18,
          context.currentTime + 0.02,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + durationMs / 1000,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + durationMs / 1000 + 0.03);
      }, delayMs);
      timeoutIds.push(timeoutId);
    };
    const playMelody = () => {
      void context.resume().catch(() => undefined);
      playTone(523, 0, 120);
      playTone(659, 150, 120);
      playTone(784, 300, 180);
    };
    const intervalId = window.setInterval(playMelody, 1200);
    const stopTimeoutId = window.setTimeout(() => {
      stopAlarm();
    }, 10000);

    playMelody();
    alarm.current = {
      context,
      intervalId,
      timeoutIds,
      stopTimeoutId,
    };
    // alarm.current = {
    //   context,
    //   intervalId: window.setInterval(playMelody, 1200),
    //   timeoutIds,
    // };
  }

  // function stopAlarm() {
  //   if (!alarm.current) {
  //     return;
  //   }

  //   window.clearInterval(alarm.current.intervalId);
  //   alarm.current.timeoutIds.forEach((timeoutId) =>
  //     window.clearTimeout(timeoutId),
  //   );
  //   void alarm.current.context.close().catch(() => undefined);
  //   alarm.current = null;
  // }
  function stopAlarm() {
    if (!alarm.current) {
      return;
    }

    window.clearInterval(alarm.current.intervalId);

    if (alarm.current.stopTimeoutId) {
      window.clearTimeout(alarm.current.stopTimeoutId);
    }

    alarm.current.timeoutIds.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );

    void alarm.current.context.close().catch(() => undefined);
    alarm.current = null;
  }
  return (
    <div
      className="notification-bell"
      onMouseEnter={openPanel}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`notification-bell-button ${hasUnseen ? "alert" : ""}`}
        type="button"
        aria-label="მონიტორინგის შეტყობინებები"
        aria-expanded={open}
        onClick={togglePanel}
      >
        {hasUnseen ? <BellRing size={18} /> : <Bell size={18} />}
        {notifications.length ? (
          <span className="notification-count">{notifications.length}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-popover" role="dialog">
          <header>
            <strong>მონიტორინგი</strong>
            <button
              className="icon-button"
              type="button"
              aria-label="დახურვა"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </header>
          <div className="notification-list">
            {notifications.length ? (
              notifications.map((notification) => (
                <div
                  key={getNotificationKey(notification)}
                  className="notification-item"
                >
                  <WifiOff size={16} />
                  <span>
                    <strong>{notification.deviceName}</strong>
                    <small>გავიდა offline - {notification.offlineCount}</small>
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">აქტიური შეტყობინება არ არის.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getNotificationKey(notification: MonitoringNotification) {
  return [
    notification.deviceId,
    notification.lastNotificationAt || notification.lastOfflineAt || "",
    notification.offlineCount,
  ].join(":");
}

function readSeenKeys() {
  try {
    const raw = window.localStorage.getItem(seenStorageKey);
    const values = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(values.filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function persistSeenKeys(keys: Set<string>) {
  try {
    window.localStorage.setItem(
      seenStorageKey,
      JSON.stringify([...keys].slice(-200)),
    );
  } catch {
    // Local storage may be unavailable in private or restricted contexts.
  }
}
