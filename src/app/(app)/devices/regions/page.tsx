import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RegionManager } from "@/components/regions/region-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDeviceTagNames,
  getDevices,
  getGardenTags,
  getRegions,
} from "@/lib/repositories";

export default async function DeviceRegionsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const canView =
    hasPermission(user, "devices.view") || hasPermission(user, "regions.view");
  if (!canView) {
    redirect(getFirstAllowedPath(user));
  }

  const [devices, regions, tags, gardenTags] = await Promise.all([
    getDevices(),
    getRegions(),
    getDeviceTagNames(),
    getGardenTags(),
  ]);

  return (
    <RegionManager
      initialDevices={devices}
      initialRegions={regions}
      initialTags={tags}
      initialGardenTags={gardenTags}
      permissions={{
        createDevice: hasPermission(user, "devices.create"),
        editDevice: hasPermission(user, "devices.edit"),
        deleteDevice: hasPermission(user, "devices.delete"),
        createTags: hasPermission(user, "devices.tag_create"),
        renameTags: hasPermission(user, "devices.tag_edit"),
        deleteTags: hasPermission(user, "devices.tag_delete"),
        createRegion: hasPermission(user, "regions.create"),
        editRegion: hasPermission(user, "regions.edit"),
        deleteRegion: hasPermission(user, "regions.delete"),
      }}
    />
  );
}
