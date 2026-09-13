"use client";

import { Menu } from "lucide-react";
import { WHEEL_TOGGLE_EVENT } from "./mobile-wheel-nav";

/**
 * Sits in the topbar on phone widths. The wheel itself listens for the event,
 * so the button stays decoupled from the wheel's own state.
 */
export function MobileNavToggle() {
  return (
    <button
      className="mobile-nav-toggle"
      type="button"
      aria-label="მთავარი მენიუ"
      title="მთავარი მენიუ"
      onClick={() => window.dispatchEvent(new Event(WHEEL_TOGGLE_EVENT))}
    >
      <Menu size={18} strokeWidth={1.9} />
    </button>
  );
}
