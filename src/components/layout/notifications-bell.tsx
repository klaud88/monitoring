"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  MessageSquare,
  Trash2,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import type { FormOneNotification, FormOneRecord } from "@/lib/types";

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

const seenMonitoringStorageKey = "offline-monitor-seen-notifications";

export function NotificationsBell({
  canOfflineMonitor,
  canFormOne,
  canRespondToCompletion,
}: {
  canOfflineMonitor: boolean;
  canFormOne: boolean;
  canRespondToCompletion: boolean;
}) {
  // Form-one state
  const [formOneNotifications, setFormOneNotifications] = useState<FormOneNotification[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FormOneNotification | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [formOneError, setFormOneError] = useState("");

  // Monitoring state
  const [monitoringNotifications, setMonitoringNotifications] = useState<MonitoringNotification[]>([]);
  const [hasUnseenMonitoring, setHasUnseenMonitoring] = useState(false);
  const seenMonitoringKeys = useRef<Set<string>>(new Set());
  const alarm = useRef<AlarmHandle | null>(null);

  // Panel state
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Form-one polling
  useEffect(() => {
    if (!canFormOne) return;
    let cancelled = false;

    async function refresh() {
      const res = await fetch("/api/form-one/notifications", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const payload = (await res.json()) as { notifications?: FormOneNotification[] };
      setFormOneNotifications(payload.notifications ?? []);
    }

    void refresh();
    const id = window.setInterval(refresh, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [canFormOne]);

  // Monitoring polling + broadcast event from dashboard
  useEffect(() => {
    if (!canOfflineMonitor) return;
    seenMonitoringKeys.current = readSeenKeys();
    let cancelled = false;

    function applyMonitoring(next: MonitoringNotification[]) {
      if (cancelled) return;
      const nextHasUnseen = next.some(
        (n) => !seenMonitoringKeys.current.has(getMonitoringKey(n)),
      );
      setMonitoringNotifications(next);
      setHasUnseenMonitoring(nextHasUnseen);
      if (nextHasUnseen) startAlarm();
      else stopAlarm();
    }

    function handleMonitoringData(event: Event) {
      const detail = (event as CustomEvent<{ notifications?: MonitoringNotification[] }>).detail;
      applyMonitoring(detail.notifications ?? []);
    }
    window.addEventListener("monitoring-data", handleMonitoringData);

    async function refresh() {
      const res = await fetch("/api/offline-records/monitoring", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const payload = (await res.json()) as { notifications?: MonitoringNotification[] };
      applyMonitoring(payload.notifications ?? []);
    }

    void refresh();
    const id = window.setInterval(refresh, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("monitoring-data", handleMonitoringData);
      stopAlarm();
    };
  }, [canOfflineMonitor]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // ── Panel toggle ──────────────────────────────────────────────────────────

  function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next && hasUnseenMonitoring) {
      monitoringNotifications.forEach((n) =>
        seenMonitoringKeys.current.add(getMonitoringKey(n)),
      );
      persistSeenKeys(seenMonitoringKeys.current);
      setHasUnseenMonitoring(false);
      stopAlarm();
    }
  }

  // ── Form-one actions ──────────────────────────────────────────────────────

  const unseenFormOneCount = formOneNotifications.filter((n) => !seenIds.has(n.id)).length;


  async function openNotification(notification: FormOneNotification) {
    setSeenIds((prev) => new Set([...prev, notification.id]));
    setSelected(notification);
    setComment("");
    setFormOneError("");
    setOpen(false);
    if (notification.type === "rejection") {
      await fetch(`/api/form-one/notifications/${notification.id}`, { method: "PATCH" }).catch(() => null);
    }
  }

  function clearAll() {
    setFormOneNotifications([]);
    setSeenIds(new Set());
    monitoringNotifications.forEach((n) =>
      seenMonitoringKeys.current.add(getMonitoringKey(n)),
    );
    persistSeenKeys(seenMonitoringKeys.current);
    setMonitoringNotifications([]);
    setHasUnseenMonitoring(false);
    stopAlarm();
  }

  async function respond(action: "approve" | "reject") {
    if (!selected) return;
    if (action === "reject" && !comment.trim()) {
      setFormOneError("უარყოფისთვის კომენტარი აუცილებელია.");
      return;
    }
    setSaving(true);
    setFormOneError("");
    const res = await fetch(`/api/form-one/${selected.recordId}/completion-response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comment }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setFormOneError("მოქმედების შესრულება ვერ მოხერხდა.");
      return;
    }
    setFormOneNotifications((current) =>
      current.filter((n) => n.recordId !== selected.recordId),
    );
    setSelected(null);
    setComment("");
  }

  function closeModal() {
    if (selected?.type === "rejection") {
      setFormOneNotifications((current) =>
        current.filter((n) => n.id !== selected.id),
      );
    }
    setSelected(null);
    setComment("");
    setFormOneError("");
  }

  // ── Alarm ─────────────────────────────────────────────────────────────────

  function startAlarm() {
    if (alarm.current || typeof window === "undefined") return;
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const context = new Ctx();
    const timeoutIds: number[] = [];

    const playTone = (frequency: number, delayMs: number, durationMs: number) => {
      const id = window.setTimeout(() => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + durationMs / 1000 + 0.03);
      }, delayMs);
      timeoutIds.push(id);
    };

    const playMelody = () => {
      void context.resume().catch(() => undefined);
      playTone(523, 0, 120);
      playTone(659, 150, 120);
      playTone(784, 300, 180);
    };

    const intervalId = window.setInterval(playMelody, 1200);
    const stopTimeoutId = window.setTimeout(() => stopAlarm(), 10000);
    playMelody();
    alarm.current = { context, intervalId, timeoutIds, stopTimeoutId };
  }

  function stopAlarm() {
    if (!alarm.current) return;
    window.clearInterval(alarm.current.intervalId);
    if (alarm.current.stopTimeoutId) window.clearTimeout(alarm.current.stopTimeoutId);
    alarm.current.timeoutIds.forEach((id) => window.clearTimeout(id));
    void alarm.current.context.close().catch(() => undefined);
    alarm.current = null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalUnseen = unseenFormOneCount + (hasUnseenMonitoring ? monitoringNotifications.length : 0);
  const hasAnyUnseen = totalUnseen > 0;
  const hasAnyNotifications = formOneNotifications.length > 0 || monitoringNotifications.length > 0;

  return (
    <>
      <div className="notification-bell" ref={bellRef}>
        <button
          className={`notification-bell-button ${hasAnyUnseen ? "alert" : ""}`}
          type="button"
          aria-label="შეტყობინებები"
          aria-expanded={open}
          onClick={togglePanel}
        >
          {hasAnyUnseen ? <BellRing size={18} /> : <Bell size={18} />}
          {totalUnseen > 0 ? (
            <span className="notification-count">{totalUnseen}</span>
          ) : null}
        </button>

        {open ? (
          <div className="notification-popover" role="dialog">
            <header>
              <strong>შეტყობინებები</strong>
              <div className="notification-header-actions">
                {hasAnyNotifications ? (
                  <button
                    className="ghost-button notification-clear-button"
                    type="button"
                    onClick={clearAll}
                  >
                    <Trash2 size={13} />
                    <span>გასუფთავება</span>
                  </button>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  aria-label="დახურვა"
                  onClick={() => setOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
            </header>

            <div className="notification-list">
              {!hasAnyNotifications ? (
                <p className="muted">აქტიური შეტყობინება არ არის.</p>
              ) : (
                <>
                  {canOfflineMonitor && monitoringNotifications.length > 0 ? (
                    <div className="notification-section">
                      <p className="notification-section-label">Offline მონიტორინგი</p>
                      {monitoringNotifications.map((n) => (
                        <div key={getMonitoringKey(n)} className="notification-item">
                          <WifiOff size={16} />
                          <span>
                            <strong>{n.deviceName}</strong>
                            <small>გავიდა offline — {n.offlineCount}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {canFormOne && formOneNotifications.length > 0 ? (
                    <div className="notification-section">
                      <p className="notification-section-label">ფორმა ერთი</p>
                      {formOneNotifications.map((notification) => {
                        const isSeen = seenIds.has(notification.id);
                        return (
                          <button
                            key={notification.id}
                            className={`notification-item form-one-notification-item${isSeen ? " seen" : ""}`}
                            type="button"
                            onClick={() => openNotification(notification)}
                          >
                            {notification.type === "rejection" ? (
                              <XCircle size={16} />
                            ) : (
                              <ClipboardList size={16} />
                            )}
                            <span>
                              <strong>{notification.record.gardenLabel}</strong>
                              <small>
                                {notification.type === "rejection"
                                  ? "ბაღმა უარყო დასრულება"
                                  : "დასრულების დადასტურება"}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="quick-task-modal-backdrop" role="presentation">
          <section
            className="quick-task-modal form-one-notification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-one-notification-title"
          >
            <header>
              <div>
                <p className="eyebrow">ფორმა ერთი</p>
                <h2 id="form-one-notification-title">{selected.record.gardenLabel}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="დახურვა" onClick={closeModal}>
                <X size={18} />
              </button>
            </header>

            <FormOneNotificationDetails record={selected.record} />

            {selected.type === "rejection" ? (
              <p className="form-one-notification-comment">
                {selected.comment || "კომენტარი არ არის მითითებული."}
              </p>
            ) : (
              <label className="form-one-notification-comment-field">
                <span>კომენტარი უარყოფის შემთხვევაში</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="ჩაწერეთ უარყოფის მიზეზი"
                />
              </label>
            )}

            {formOneError ? <p className="form-error">{formOneError}</p> : null}

            <div className="form-one-notification-actions">
              <Link
                className="ghost-button"
                href={`/formaerti?record=${selected.recordId}`}
                onClick={closeModal}
              >
                <ExternalLink size={16} />
                <span>ფორმაზე გადასვლა</span>
              </Link>
              {selected.type === "completion_request" && canRespondToCompletion ? (
                <>
                  <button
                    className="primary-button danger"
                    type="button"
                    onClick={() => respond("reject")}
                    disabled={saving}
                  >
                    <XCircle size={17} />
                    <span>უარყოფა</span>
                  </button>
                  <button
                    className="primary-button success"
                    type="button"
                    onClick={() => respond("approve")}
                    disabled={saving}
                  >
                    <CheckCircle2 size={17} />
                    <span>დადასტურება</span>
                  </button>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function FormOneNotificationDetails({ record }: { record: FormOneRecord }) {
  const totalQuantity = record.items.reduce((sum, item) => sum + item.quantity, 0);
  const dueDateClassName =
    record.dueDates.length > 1 ? "form-one-due-date-value changed" : undefined;

  return (
    <div className="form-one-notification-details">
      <div className="form-one-notification-stats">
        <span>შექმნა: {formatDisplayDate(record.submittedDate)}</span>
        <span>მომსახურება: {record.items.length}</span>
        <span>რაოდენობა: {totalQuantity}</span>
        <span className={dueDateClassName}>
          შესრულება:{" "}
          {record.dueDates.length
            ? record.dueDates.map((entry) => formatDisplayDate(entry.date)).join(", ")
            : "არ არის მითითებული"}
        </span>
      </div>
      <div className="form-one-notification-items">
        {record.items.map((item, index) => (
          <div key={`${record.id}-${index}-${item.serviceLabel}`}>
            <strong>{item.modelLabel}</strong>
            <span>{item.serviceLabel}</span>
            <small>{item.quantity}</small>
          </div>
        ))}
      </div>
      {record.rejectionComments.length ? (
        <div className="form-one-record-comments">
          {record.rejectionComments.map((item) => (
            <p key={item.id}>
              <MessageSquare size={14} />
              <span>
                {formatDisplayDateTime(item.rejectedAt)} — {item.comment}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getMonitoringKey(n: MonitoringNotification) {
  return [n.deviceId, n.lastNotificationAt || n.lastOfflineAt || "", n.offlineCount].join(":");
}

function readSeenKeys() {
  try {
    const raw = window.localStorage.getItem(seenMonitoringStorageKey);
    const values = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(values.filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function persistSeenKeys(keys: Set<string>) {
  try {
    window.localStorage.setItem(
      seenMonitoringStorageKey,
      JSON.stringify([...keys].slice(-200)),
    );
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

function formatDisplayDate(value: string) {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value.trim();
}

function formatDisplayDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
