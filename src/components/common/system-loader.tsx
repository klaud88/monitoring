"use client";

import { Cloud, Code2, Cpu, Database, Server } from "lucide-react";

const R = 40;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Props = {
  progress: number;
  message: string;
};

export function SystemLoader({ progress, message }: Props) {
  const p = Math.min(Math.max(progress, 0), 100);
  const offset = CIRCUMFERENCE * (1 - p / 100);

  return (
    <div style={styles.root}>
      <div style={styles.graph}>
        <svg viewBox="0 0 100 100" style={styles.svg} aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.2" />
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke="#4da3ff"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.22s linear" }}
          />
        </svg>

        {/* Orbiting nodes wrapper — rotates 360° continuously */}
        <div className="sysloader-orbit">
          <div className="sysloader-node sysloader-node--top">
            <Cloud size={15} strokeWidth={1.4} />
          </div>
          <div className="sysloader-node sysloader-node--left">
            <Cpu size={15} strokeWidth={1.4} />
          </div>
          <div className="sysloader-node sysloader-node--right">
            <Database size={15} strokeWidth={1.4} />
          </div>
          <div className="sysloader-node sysloader-node--bottom">
            <Code2 size={15} strokeWidth={1.4} />
          </div>
        </div>

        <div style={styles.center}>
          <Server size={34} strokeWidth={1.2} color="#4da3ff" />
          <span style={styles.pct}>{Math.round(p)}%</span>
        </div>
      </div>

      <div style={styles.footer}>
        <div style={styles.track}>
          <div style={{ ...styles.fill, width: `${p}%` }} />
        </div>
        <p style={styles.label}>{message}</p>
      </div>

      <style>{css}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 28,
  },
  graph: {
    position: "relative",
    width: 260,
    height: 260,
  },
  svg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  center: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    pointerEvents: "none",
  },
  pct: {
    fontSize: "1.6rem",
    fontWeight: 700,
    color: "#edf4fb",
    fontVariantNumeric: "tabular-nums",
  },
  footer: {
    width: 260,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  track: {
    height: 4,
    background: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    background: "#4da3ff",
    borderRadius: 2,
    transition: "width 0.2s linear",
  },
  label: {
    margin: 0,
    textAlign: "center",
    fontSize: "0.82rem",
    color: "#a7b4c6",
    letterSpacing: "0.01em",
  },
};

const css = `
  .sysloader-orbit {
    position: absolute;
    inset: 0;
    transform-origin: 50% 50%;
    animation: sysloader-orbit 5s linear infinite;
  }

  .sysloader-node {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #1e2a3a;
    border: 1px solid rgba(255,255,255,0.14);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4da3ff;
    /* counter-rotate so icon stays upright */
    animation: sysloader-counter 5s linear infinite;
  }

  .sysloader-node--top    { top: 10%; left: 50%; }
  .sysloader-node--left   { top: 50%; left: 10%; }
  .sysloader-node--right  { top: 50%; left: 90%; }
  .sysloader-node--bottom { top: 90%; left: 50%; }

  @keyframes sysloader-orbit {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  @keyframes sysloader-counter {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(-360deg); }
  }
`;
