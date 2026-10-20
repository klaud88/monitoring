import Link from "next/link";
import { PlatformLogoutButton } from "@/components/platform/platform-logout-button";
import { requirePlatformAdmin } from "@/lib/platform-page";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePlatformAdmin();

  return (
    <div className="platform-shell">
      <header className="platform-topbar">
        <Link href="/platform" className="platform-brand">
          OneBit · პლატფორმა
        </Link>
        <PlatformLogoutButton />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
