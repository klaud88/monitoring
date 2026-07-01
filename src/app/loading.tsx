"use client";

import { useEffect, useRef, useState } from "react";
import { SystemLoader } from "@/components/common/system-loader";

function getMessage(p: number) {
  if (p < 35) return "სისტემის ინიციალიზაცია";
  if (p < 65) return "სერვერთან დაკავშირება";
  return "მონაცემების ჩატვირთვა";
}

export default function Loading() {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let start: number | null = null;

    function step(ts: number) {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000;
      // Asymptotic curve — approaches 92 but never gets there,
      // so "მზადაა" never shows; Next.js unmounts this when page is ready.
      const p = 92 * (1 - Math.exp(-elapsed / 1.4));
      setProgress(p);
      raf.current = requestAnimationFrame(step);
    }

    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, []);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0b1220",
      zIndex: 9999,
    }}>
      <SystemLoader progress={progress} message={getMessage(progress)} />
    </div>
  );
}
