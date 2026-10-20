"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function PlatformLogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/platform/api/logout", { method: "POST" }).catch(() => null);
    router.replace("/platform/login");
    router.refresh();
  }

  return (
    <button className="ghost-button" type="button" onClick={logout}>
      <LogOut size={16} />
      <span>გასვლა</span>
    </button>
  );
}
