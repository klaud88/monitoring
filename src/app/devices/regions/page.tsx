import { AppShell } from "@/components/layout/app-shell";
import { RegionManager } from "@/components/regions/region-manager";
import { getDevices } from "@/lib/repositories";

export default async function DeviceRegionsPage() {
  const devices = await getDevices();

  return (
    <AppShell>
      <RegionManager initialDevices={devices} />
    </AppShell>
  );
}
