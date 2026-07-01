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
  X,
  XCircle,
} from "lucide-react";
import type { FormOneNotification, FormOneRecord } from "@/lib/types";

export function FormOneNotifications({
  canRespondToCompletion,
}: {
  canRespondToCompletion: boolean;
}) {
  const [notifications, setNotifications] = useState<FormOneNotification[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FormOneNotification | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshNotifications() {
      const response = await fetch("/api/form-one/notifications", {
        cache: "no-store",
      }).catch(() => null);

      if (!response?.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as {
        notifications?: FormOneNotification[];
      };
      setNotifications(payload.notifications ?? []);
    }

    void refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function openNotification(notification: FormOneNotification) {
    setSeenIds((prev) => new Set([...prev, notification.id]));
    setSelected(notification);
    setComment("");
    setError("");
    setOpen(false);

    if (notification.type === "rejection") {
      await markRead(notification.id);
    }
  }

  async function markRead(notificationId: string) {
    await fetch(`/api/form-one/notifications/${notificationId}`, {
      method: "PATCH",
    }).catch(() => null);
  }

  function clearHistory() {
    setNotifications((current) => current.filter((n) => !seenIds.has(n.id)));
    setSeenIds(new Set());
  }

  async function respond(action: "approve" | "reject") {
    if (!selected) {
      return;
    }
    if (action === "reject" && !comment.trim()) {
      setError("უარყოფისთვის კომენტარი აუცილებელია.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(
      `/api/form-one/${selected.recordId}/completion-response`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment }),
      },
    ).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("მოქმედების შესრულება ვერ მოხერხდა.");
      return;
    }

    setNotifications((current) =>
      current.filter((notification) => notification.recordId !== selected.recordId),
    );
    setSelected(null);
    setComment("");
  }

  function closeModal() {
    if (selected?.type === "rejection") {
      setNotifications((current) =>
        current.filter((notification) => notification.id !== selected.id),
      );
    }
    setSelected(null);
    setComment("");
    setError("");
  }

  const unseenCount = notifications.filter((n) => !seenIds.has(n.id)).length;
  const hasUnseen = unseenCount > 0;
  const hasSeen = notifications.some((n) => seenIds.has(n.id));

  return (
    <>
      <div className="notification-bell" ref={bellRef}>
        <button
          className={`notification-bell-button ${hasUnseen ? "alert" : ""}`}
          type="button"
          aria-label="ფორმა ერთის შეტყობინებები"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {hasUnseen ? <BellRing size={18} /> : <Bell size={18} />}
          {unseenCount > 0 ? (
            <span className="notification-count">{unseenCount}</span>
          ) : null}
        </button>

        {open ? (
          <div className="notification-popover" role="dialog">
            <header>
              <strong>ფორმა ერთი</strong>
              <div className="notification-header-actions">
                {hasSeen ? (
                  <button
                    className="ghost-button notification-clear-button"
                    type="button"
                    onClick={clearHistory}
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
              {notifications.length ? (
                notifications.map((notification) => {
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
                })
              ) : (
                <p className="muted">აქტიური შეტყობინება არ არის.</p>
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
                <h2 id="form-one-notification-title">
                  {selected.record.gardenLabel}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="დახურვა"
                onClick={closeModal}
              >
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
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="ჩაწერეთ უარყოფის მიზეზი"
                />
              </label>
            )}

            {error ? <p className="form-error">{error}</p> : null}

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
  const totalQuantity = record.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
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
                {formatDisplayDateTime(item.rejectedAt)} - {item.comment}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDisplayDate(value: string) {
  const normalized = value.trim();
  const dateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return normalized;
  }

  return `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`;
}

function formatDisplayDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
