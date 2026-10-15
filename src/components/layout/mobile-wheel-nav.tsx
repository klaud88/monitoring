"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  FileText,
  ChevronLeft,
  MapPinned,
  MonitorCog,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";
import { useNavBadges } from "./use-nav-badges";

export const WHEEL_TOGGLE_EVENT = "bagebi-wheel-toggle";

type BadgeKey = "formOne" | "offline";

type WheelItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: BadgeKey;
};

/**
 * Flattened sidebar order. The wheel has no groups — the arc itself is the
 * grouping, so the labels are the short ones that fit the centred chip.
 */
const wheelItems: WheelItem[] = [
  { href: "/dashboard", label: "რუკა", icon: MapPinned },
  { href: "/analytics", label: "ანალიტიკა", icon: BarChart3 },
  { href: "/tasks", label: "დავალებები", icon: ClipboardList },
  { href: "/problem-reports", label: "პრობლემები", icon: AlertCircle },
  { href: "/formaerti", label: "ფორმაერთი", icon: FileText, badge: "formOne" },
  { href: "/devices/regions", label: "მოწყობილობები", icon: MonitorCog },
  {
    href: "/offline-records",
    label: "Offline აღრიცხვა",
    icon: WifiOff,
    badge: "offline",
  },
  { href: "/admin/users", label: "მომხმარებლები", icon: Users },
  { href: "/admin/permissions", label: "წვდომის უფლებები", icon: ShieldCheck },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { href: "/profile", label: "პროფილი", icon: UserRound },
];

/** Degrees between two neighbouring icons on the arc. */
const STEP = 17;
/** Angle at which an icon has faded out completely. */
const FADE = 56;
/** Size against the first, full-width wheel — small enough to keep the page in view. */
const SCALE = 0.6;
/** How far the disc bulges past the centred icon. */
const PAD = 58 * SCALE;

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  if (href === "/devices/regions") {
    return pathname === href || pathname.startsWith("/devices");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileWheelNav({
  allowedHrefs,
  canFormOne,
  canOfflineMonitor,
}: {
  allowedHrefs: string[];
  canFormOne: boolean;
  canOfflineMonitor: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const badges = useNavBadges({ canFormOne, canOfflineMonitor });

  const items = useMemo(() => {
    const allowed = new Set(allowedHrefs);
    return wheelItems.filter(
      (item) => item.href === "/profile" || allowed.has(item.href),
    );
  }, [allowedHrefs]);

  const activeIndex = useMemo(() => {
    const found = items.findIndex((item) => isActivePath(pathname, item.href));
    return found < 0 ? 0 : found;
  }, [items, pathname]);

  const layerRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<SVGSVGElement>(null);
  const railPathRef = useRef<SVGPathElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Everything the animation loop mutates lives here, never in React state. */
  const wheel = useRef({
    offset: 0,
    target: 0,
    open: 0,
    openTarget: 0,
    current: 0,
    raf: 0,
  });

  const navigate = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        router.push(item.href);
      }
    },
    [items, router],
  );

  useEffect(() => {
    const layer = layerRef.current;
    const edge = edgeRef.current;
    const disc = discRef.current;
    const scrim = scrimRef.current;
    const rail = railRef.current;
    const railPath = railPathRef.current;
    const mark = markRef.current;
    const tag = tagRef.current;
    const handle = handleRef.current;
    if (!layer || !edge || !disc || !scrim || !rail || !railPath || !mark || !tag || !handle) {
      return;
    }

    const state = wheel.current;
    const count = items.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let radius = 0;
    let reach = 0;
    let centreX = 0;
    let centreY = 0;
    let pixelsPerItem = 1;

    /** x of the point on the arc at `radians`, 0 being the centred icon. */
    function arcX(radians: number) {
      return centreX - radius * Math.cos(radians);
    }

    function geometry() {
      width = layer!.clientWidth;
      height = layer!.clientHeight;
      radius = width * 0.95 * SCALE;
      // The centre sits off the right edge, so the arc bulges in from the right.
      reach = width * 0.34 * SCALE;
      centreX = width - reach + radius;
      centreY = height * 0.52;
      pixelsPerItem = (radius * STEP * Math.PI) / 180;

      const size = (radius + PAD) * 2;
      disc!.style.width = `${size}px`;
      disc!.style.height = `${size}px`;
      disc!.style.marginLeft = `${centreX - radius - PAD}px`;
      disc!.style.marginTop = `${centreY - radius - PAD}px`;

      const from = (-72 * Math.PI) / 180;
      const to = (72 * Math.PI) / 180;
      railPath!.setAttribute(
        "d",
        `M ${arcX(from).toFixed(1)} ${(centreY + radius * Math.sin(from)).toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 0 ${arcX(to).toFixed(1)} ${(centreY + radius * Math.sin(to)).toFixed(1)}`,
      );
      mark!.style.marginLeft = `${centreX - radius - PAD - 1.5}px`;
      mark!.style.marginTop = `${centreY - 9}px`;
    }

    function clamp(value: number, min: number, max: number) {
      return value < min ? min : value > max ? max : value;
    }

    function render() {
      const shift = (1 - state.open) * (reach + PAD + 16);
      disc!.style.transform = `translateX(${shift.toFixed(1)}px)`;
      disc!.style.opacity = String(clamp(state.open * 1.15, 0, 1));
      scrim!.style.opacity = (state.open * 0.95).toFixed(3);
      rail!.style.opacity = (state.open * state.open).toFixed(3);
      rail!.style.transform = `translateX(${shift.toFixed(1)}px)`;
      mark!.style.opacity = (state.open * state.open * 0.9).toFixed(3);
      mark!.style.transform = `translateX(${shift.toFixed(1)}px)`;

      const nearest = Math.round(state.offset);
      if (nearest !== state.current) {
        itemRefs.current[state.current]?.classList.remove("is-centred");
        state.current = nearest;
        itemRefs.current[state.current]?.classList.add("is-centred");
      }

      let centredY = centreY;
      for (let i = 0; i < count; i += 1) {
        const element = itemRefs.current[i];
        if (!element) {
          continue;
        }
        const degrees = (i - state.offset) * STEP;
        const radians = (degrees * Math.PI) / 180;
        const x = arcX(radians) + shift;
        const y = centreY + radius * Math.sin(radians);
        const falloff = Math.cos(
          Math.min(Math.abs(degrees) / FADE, 1) * (Math.PI / 2),
        );
        const opacity = Math.pow(falloff, 1.5) * state.open;
        const scale = 0.66 + 0.44 * falloff;

        element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        element.style.opacity = opacity.toFixed(3);
        element.style.pointerEvents = opacity > 0.12 ? "auto" : "none";
        element.tabIndex = opacity > 0.12 && state.open > 0.6 ? 0 : -1;
        if (i === state.current) {
          centredY = y;
        }
      }

      const settle = 1 - Math.min(Math.abs(state.offset - state.current) * 3.4, 1);
      tag!.textContent = items[state.current]?.label ?? "";
      tag!.style.opacity = (settle * state.open * state.open).toFixed(3);
      // the chip hangs off the disc's inner edge, so it grows leftwards
      tag!.style.transform = `translate(${(centreX - radius - PAD - 10 + shift).toFixed(1)}px, ${centredY.toFixed(1)}px) translate(-100%, -50%) translateX(${(settle * 8 - 8).toFixed(1)}px)`;

      handle!.style.opacity = (0.9 * (1 - state.open)).toFixed(3);
      layer!.classList.toggle("is-open", state.open > 0.02);
      edge!.style.pointerEvents = state.open > 0.02 ? "none" : "auto";
      document.documentElement.classList.toggle(
        "wheel-locked",
        state.open > 0.02,
      );
    }

    function kick() {
      if (!state.raf) {
        state.raf = requestAnimationFrame(tick);
      }
    }

    function tick() {
      state.raf = 0;
      let running = false;

      if (!drag || drag.mode !== "spin") {
        const delta = state.target - state.offset;
        if (Math.abs(delta) > 0.0008) {
          state.offset += delta * (reduce ? 1 : 0.2);
          running = true;
        } else {
          state.offset = state.target;
        }
      } else {
        running = true;
      }

      const openDelta = state.openTarget - state.open;
      if (Math.abs(openDelta) > 0.0015) {
        state.open += openDelta * (reduce ? 1 : 0.22);
        running = true;
      } else {
        state.open = state.openTarget;
      }

      render();
      if (running) {
        kick();
      }
    }

    type Drag = {
      mode: "open" | "spin" | "scrim";
      x0: number;
      y0: number;
      moved: number;
      started: number;
      base?: number;
      lastY?: number;
      lastT?: number;
      velocity?: number;
      hit?: HTMLElement | null;
    };
    let drag: Drag | null = null;

    function point(event: PointerEvent) {
      const box = layer!.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function onEdgeDown(event: PointerEvent) {
      edge!.setPointerCapture(event.pointerId);
      const p = point(event);
      drag = { mode: "open", x0: p.x, y0: p.y, moved: 0, started: performance.now() };
    }

    function onLayerDown(event: PointerEvent) {
      if (state.open < 0.4) {
        return;
      }
      const p = point(event);
      layer!.setPointerCapture(event.pointerId);
      if (p.x < centreX - radius - PAD) {
        drag = { mode: "scrim", x0: p.x, y0: p.y, moved: 0, started: performance.now() };
        return;
      }
      const target = event.target as HTMLElement | null;
      drag = {
        mode: "spin",
        x0: p.x,
        y0: p.y,
        moved: 0,
        started: performance.now(),
        base: state.offset,
        lastY: p.y,
        lastT: performance.now(),
        velocity: 0,
        hit: target?.closest?.(".wheel-item") as HTMLElement | null,
      };
    }

    function onMove(event: PointerEvent) {
      if (!drag) {
        return;
      }
      const p = point(event);
      const dx = p.x - drag.x0;
      const dy = p.y - drag.y0;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));

      if (drag.mode === "open") {
        state.open = clamp(-dx / (reach + PAD), 0, 1);
        state.openTarget = state.open;
        render();
        return;
      }

      if (drag.mode !== "spin") {
        return;
      }

      let raw = (drag.base ?? 0) - dy / pixelsPerItem;
      if (raw < 0) {
        raw *= 0.32;
      } else if (raw > count - 1) {
        raw = count - 1 + (raw - (count - 1)) * 0.32;
      }

      const now = performance.now();
      const dt = now - (drag.lastT ?? now);
      if (dt > 0) {
        const instant = -(p.y - (drag.lastY ?? p.y)) / pixelsPerItem / dt;
        drag.velocity = (drag.velocity ?? 0) * 0.72 + instant * 0.28;
        drag.lastY = p.y;
        drag.lastT = now;
      }

      state.offset = raw;

      if (dx > 60 && Math.abs(dy) < 40) {
        drag = null;
        state.openTarget = 0;
        kick();
        return;
      }

      render();
      kick();
    }

    function onUp(event: PointerEvent) {
      if (!drag) {
        return;
      }
      const finished = drag;
      drag = null;
      const p = point(event);
      const quick = performance.now() - finished.started < 400;

      if (finished.mode === "open") {
        // a tap on the ball opens the wheel as surely as a swipe does
        const tapped = quick && finished.moved < 8;
        state.openTarget =
          tapped || state.open > 0.35 || (quick && finished.x0 - p.x > 26)
            ? 1
            : 0;
      } else if (finished.mode === "scrim") {
        if (finished.moved < 10) {
          state.openTarget = 0;
        }
      } else if (finished.moved < 9 && quick && finished.hit) {
        const index = Number(finished.hit.dataset.index);
        if (index === Math.round(state.offset)) {
          state.openTarget = 0;
          navigate(index);
        } else {
          state.target = index;
        }
      } else {
        state.target = clamp(
          Math.round(state.offset + clamp((finished.velocity ?? 0) * 140, -3.2, 3.2)),
          0,
          count - 1,
        );
      }

      kick();
    }

    function onWheelScroll(event: WheelEvent) {
      if (state.open < 0.4) {
        return;
      }
      event.preventDefault();
      state.target = clamp(
        Math.round(state.offset + Math.sign(event.deltaY)),
        0,
        count - 1,
      );
      kick();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        state.target = clamp(Math.round(state.offset) - 1, 0, count - 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        state.target = clamp(Math.round(state.offset) + 1, 0, count - 1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.openTarget = 0;
        navigate(Math.round(state.offset));
      } else if (event.key === "Escape") {
        state.openTarget = 0;
      } else {
        return;
      }
      kick();
    }

    function onToggle() {
      state.openTarget = state.openTarget > 0.5 ? 0 : 1;
      kick();
      if (state.openTarget === 1) {
        window.setTimeout(() => {
          itemRefs.current[state.current]?.focus();
        }, 220);
      }
    }

    function onResize() {
      geometry();
      render();
    }

    edge.addEventListener("pointerdown", onEdgeDown);
    edge.addEventListener("pointermove", onMove);
    edge.addEventListener("pointerup", onUp);
    edge.addEventListener("pointercancel", onUp);
    layer.addEventListener("pointerdown", onLayerDown);
    layer.addEventListener("pointermove", onMove);
    layer.addEventListener("pointerup", onUp);
    layer.addEventListener("pointercancel", onUp);
    layer.addEventListener("wheel", onWheelScroll, { passive: false });
    layer.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener(WHEEL_TOGGLE_EVENT, onToggle);

    geometry();
    render();

    return () => {
      edge.removeEventListener("pointerdown", onEdgeDown);
      edge.removeEventListener("pointermove", onMove);
      edge.removeEventListener("pointerup", onUp);
      edge.removeEventListener("pointercancel", onUp);
      layer.removeEventListener("pointerdown", onLayerDown);
      layer.removeEventListener("pointermove", onMove);
      layer.removeEventListener("pointerup", onUp);
      layer.removeEventListener("pointercancel", onUp);
      layer.removeEventListener("wheel", onWheelScroll);
      layer.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(WHEEL_TOGGLE_EVENT, onToggle);
      if (state.raf) {
        cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      document.documentElement.classList.remove("wheel-locked");
    };
  }, [items, navigate]);

  /** A finished navigation closes the wheel and re-centres it on the new page. */
  useEffect(() => {
    const state = wheel.current;
    state.offset = activeIndex;
    state.target = activeIndex;
    state.openTarget = 0;
    state.open = 0;
    itemRefs.current.forEach((element, index) => {
      element?.classList.toggle("is-centred", index === activeIndex);
    });
    state.current = activeIndex;
    if (!state.raf) {
      state.raf = requestAnimationFrame(() => {
        state.raf = 0;
      });
    }
    window.dispatchEvent(new Event("resize"));
  }, [activeIndex]);

  return (
    <div className="wheel-root" aria-hidden={false}>
      <div className="wheel-edge" ref={edgeRef} />
      <span className="wheel-handle" ref={handleRef} aria-hidden="true">
        <ChevronLeft size={30} strokeWidth={2.75} />
      </span>

      <div className="wheel-layer" ref={layerRef} role="menu" aria-label="მთავარი მენიუ">
        <div className="wheel-scrim" ref={scrimRef} />
        <div className="wheel-disc" ref={discRef} />
        <svg className="wheel-rail" ref={railRef} aria-hidden="true">
          <defs>
            <linearGradient id="bagebi-wheel-rail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4da3ff" stopOpacity="0" />
              <stop offset="34%" stopColor="#4da3ff" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#4da3ff" stopOpacity="0.55" />
              <stop offset="66%" stopColor="#4da3ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#4da3ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path ref={railPathRef} stroke="url(#bagebi-wheel-rail)" />
        </svg>
        <span className="wheel-mark" ref={markRef} />

        {items.map((item, index) => {
          const Icon = item.icon;
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <button
              key={item.href}
              type="button"
              className="wheel-item"
              data-index={index}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              aria-label={
                count > 0 ? `${item.label} — ${count} ახალი` : item.label
              }
              tabIndex={-1}
            >
              <span className="wheel-item-icon">
                <Icon size={15} strokeWidth={1.9} />
              </span>
              {count > 0 ? (
                <span className="wheel-item-badge">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}

        <span className="wheel-tag" ref={tagRef} />
      </div>
    </div>
  );
}
