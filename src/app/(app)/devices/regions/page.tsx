import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RegionManager } from "@/components/regions/region-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDeletedDeviceTagNames,
  getDeviceTagNames,
  getDevices,
  getGardenRegions,
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

  const canDeleteDevice = hasPermission(user, "devices.delete");
  const canDeleteRegion = hasPermission(user, "regions.delete");
  const canDeleteTags = hasPermission(user, "devices.tag_delete");
  const [devices, regions, tags, gardenTags, gardenRegions, deletedTags] =
    await Promise.all([
    // Deleted devices are loaded only for those who may restore them.
    getDevices({ includeDeleted: canDeleteDevice }),
    getRegions({ includeDeleted: canDeleteRegion }),
    getDeviceTagNames(),
    getGardenTags(),
    getGardenRegions(),
    canDeleteTags ? getDeletedDeviceTagNames() : Promise.resolve([]),
  ]);

  return (
    <RegionManager
      initialDevices={devices}
      initialRegions={regions}
      initialTags={tags}
      initialGardenTags={gardenTags}
      initialGardenRegions={gardenRegions}
      initialDeletedTags={deletedTags}
      permissions={{
        createDevice: hasPermission(user, "devices.create"),
        editDevice: hasPermission(user, "devices.edit"),
        deleteDevice: canDeleteDevice,
        createTags: hasPermission(user, "devices.tag_create"),
        renameTags: hasPermission(user, "devices.tag_edit"),
        deleteTags: canDeleteTags,
        createRegion: hasPermission(user, "regions.create"),
        editRegion: hasPermission(user, "regions.edit"),
        deleteRegion: canDeleteRegion,
      }}
    />
  );
}
