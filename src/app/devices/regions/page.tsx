import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { RegionManager } from "@/components/regions/region-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getDevices, getRegions } from "@/lib/repositories";

export default async function DeviceRegionsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const [devices, regions] = await Promise.all([getDevices(), getRegions()]);
  const canView =
    hasPermission(user, "devices.view") || hasPermission(user, "regions.view");

  return (
    <AppShell>
      {canView ? (
        <RegionManager
          initialDevices={devices}
          initialRegions={regions}
          permissions={{
            createDevice: hasPermission(user, "devices.create"),
            editDevice: hasPermission(user, "devices.edit"),
            deleteDevice: hasPermission(user, "devices.delete"),
            createRegion: hasPermission(user, "regions.create"),
            editRegion: hasPermission(user, "regions.edit"),
            deleteRegion: hasPermission(user, "regions.delete"),
          }}
        />
      ) : (
        <section className="surface empty-state">წვდომა შეზღუდულია.</section>
      )}
    </AppShell>
  );
}
