import type { AppUser, AuditLog, Device, PermissionKey, Task } from "./types";

const allPermissions: PermissionKey[] = [
  "dashboard.view",
  "dashboard.create",
  "dashboard.edit",
  "dashboard.delete",
  "devices.view",
  "devices.create",
  "devices.edit",
  "devices.delete",
  "tasks.view",
  "tasks.create",
  "tasks.edit",
  "tasks.delete",
  "regions.view",
  "regions.create",
  "regions.edit",
  "regions.delete",
  "offline_records.view",
  "offline_records.create",
  "offline_records.edit",
  "offline_records.delete",
  "users.view",
  "users.create",
  "users.edit",
  "users.delete",
  "permissions.view",
  "permissions.create",
  "permissions.edit",
  "permissions.delete",
  "analytics.view",
  "analytics.create",
  "analytics.edit",
  "analytics.delete"
];

export const mockUsers: AppUser[] = [
  {
    id: "u-admin",
    name: "ნინო ბერიძე",
    email: "admin@local.ge",
    role: "admin",
    initials: "NB",
    color: "#2563eb",
    permissions: allPermissions,
    passwordHash: "$2a$10$NHMqWUDYrKFNoAa4z39nqeIlN9IAdd9VVQtmFyF2laDF15TVIHrwC"
  },
  {
    id: "u-giorgi",
    name: "გიორგი კაპანაძე",
    email: "giorgi@local.ge",
    role: "technician",
    initials: "GK",
    color: "#16a34a",
    permissions: ["dashboard.view", "devices.view", "devices.edit", "tasks.view", "tasks.edit", "regions.view"]
  },
  {
    id: "u-maka",
    name: "მაკა წერეთელი",
    email: "maka@local.ge",
    role: "dispatcher",
    initials: "MT",
    color: "#f97316",
    permissions: [
      "dashboard.view",
      "devices.view",
      "devices.create",
      "devices.edit",
      "tasks.view",
      "tasks.create",
      "tasks.edit",
      "regions.view",
      "analytics.view"
    ]
  },
  {
    id: "u-levan",
    name: "ლევან მაისურაძე",
    email: "levan@local.ge",
    role: "technician",
    initials: "LM",
    color: "#7c3aed",
    permissions: ["dashboard.view", "devices.view", "devices.edit", "tasks.view", "tasks.edit", "analytics.view"]
  },
  {
    id: "u-ana",
    name: "ანა გოცირიძე",
    email: "ana@local.ge",
    role: "viewer",
    initials: "AG",
    color: "#0f766e",
    permissions: ["dashboard.view", "devices.view", "tasks.view", "analytics.view"]
  }
];

export const mockDevices: Device[] = [
  {
    id: "dev-101",
    code: "TB-101",
    name: "ვაკე - ჭავჭავაძე",
    status: "offline",
    isExcluded: false,
    region: "ვაკე-საბურთალო",
    tags: ["offline", "ელ.პრობლემა"],
    position: { x: 31, y: 48 },
    lastSeenAt: "2026-05-27T16:35:00+04:00",
    associatedDevices: ["BioEntry W2", "DM-20 Door Module", "CoreStation #1"],
    problems: [
      {
        id: "p-101-1",
        title: "ქსელთან კავშირი დაკარგულია",
        description: "დავაისი BioStar2-ში offline ჩანს ბოლო პინგის შემდეგ.",
        status: "planned",
        reportedAt: "2026-05-27T16:40:00+04:00",
        plannedAt: "2026-05-28T10:00:00+04:00",
        ownerUserId: "u-giorgi"
      },
      {
        id: "p-101-2",
        title: "Door relay delay",
        description: "გაღების ბრძანებაზე ფიქსირდებოდა 3-5 წამიანი დაყოვნება.",
        status: "resolved",
        reportedAt: "2026-05-12T11:20:00+04:00",
        resolvedAt: "2026-05-12T14:15:00+04:00",
        ownerUserId: "u-maka"
      }
    ],
    statusEvents: [
      { id: "e-101-1", deviceId: "dev-101", status: "offline", happenedAt: "2026-05-27T16:35:00+04:00", durationMinutes: 245 },
      { id: "e-101-2", deviceId: "dev-101", status: "offline", happenedAt: "2026-04-12T08:10:00+04:00", durationMinutes: 58 },
      { id: "e-101-3", deviceId: "dev-101", status: "offline", happenedAt: "2026-03-08T19:05:00+04:00", durationMinutes: 141 },
      { id: "e-101-4", deviceId: "dev-101", status: "offline", happenedAt: "2025-11-21T13:44:00+04:00", durationMinutes: 37 }
    ]
  },
  {
    id: "dev-118",
    code: "TB-118",
    name: "საბურთალო - უნივერსიტეტი",
    status: "online",
    isExcluded: false,
    region: "ვაკე-საბურთალო",
    tags: ["offline"],
    position: { x: 42, y: 37 },
    lastSeenAt: "2026-05-27T21:02:00+04:00",
    associatedDevices: ["FaceStation F2", "Secure I/O 2"],
    problems: [
      {
        id: "p-118-1",
        title: "ბიომეტრიის განახლება",
        description: "დაგეგმილია firmware update ღამის ფანჯარაში.",
        status: "planned",
        reportedAt: "2026-05-25T12:00:00+04:00",
        plannedAt: "2026-05-29T02:00:00+04:00",
        ownerUserId: "u-levan"
      }
    ],
    statusEvents: [
      { id: "e-118-1", deviceId: "dev-118", status: "offline", happenedAt: "2026-02-18T10:45:00+04:00", durationMinutes: 19 },
      { id: "e-118-2", deviceId: "dev-118", status: "offline", happenedAt: "2025-12-02T03:11:00+04:00", durationMinutes: 24 }
    ]
  },
  {
    id: "dev-203",
    code: "TB-203",
    name: "რუსთაველი - ოპერა",
    status: "online",
    isExcluded: false,
    region: "მთაწმინდა-კრწანისი",
    tags: ["კამერები"],
    position: { x: 51, y: 49 },
    lastSeenAt: "2026-05-27T21:05:00+04:00",
    associatedDevices: ["BioLite N2", "Entrance Camera #3"],
    problems: [],
    statusEvents: [
      { id: "e-203-1", deviceId: "dev-203", status: "offline", happenedAt: "2026-01-09T22:30:00+04:00", durationMinutes: 33 }
    ]
  },
  {
    id: "dev-244",
    code: "TB-244",
    name: "ავლაბარი - მეტრო",
    status: "offline",
    isExcluded: false,
    region: "ისანი-სამგორი",
    tags: ["offline", "UPS", "ელ.პრობლემა"],
    position: { x: 62, y: 56 },
    lastSeenAt: "2026-05-27T14:50:00+04:00",
    associatedDevices: ["BioStation 3", "UPS Sensor", "DM-20 Door Module"],
    problems: [
      {
        id: "p-244-1",
        title: "UPS ძაბვა დაბალია",
        description: "სავარაუდოა ელკვების ჩავარდნა, საჭიროა ადგილზე შემოწმება.",
        status: "open",
        reportedAt: "2026-05-27T15:00:00+04:00",
        ownerUserId: "u-maka"
      }
    ],
    statusEvents: [
      { id: "e-244-1", deviceId: "dev-244", status: "offline", happenedAt: "2026-05-27T14:50:00+04:00", durationMinutes: 350 },
      { id: "e-244-2", deviceId: "dev-244", status: "offline", happenedAt: "2026-05-03T09:16:00+04:00", durationMinutes: 88 },
      { id: "e-244-3", deviceId: "dev-244", status: "offline", happenedAt: "2026-04-18T01:22:00+04:00", durationMinutes: 211 },
      { id: "e-244-4", deviceId: "dev-244", status: "offline", happenedAt: "2026-02-14T20:41:00+04:00", durationMinutes: 63 },
      { id: "e-244-5", deviceId: "dev-244", status: "offline", happenedAt: "2025-10-29T05:10:00+04:00", durationMinutes: 42 }
    ]
  },
  {
    id: "dev-305",
    code: "TB-305",
    name: "დიდუბე - სადგური",
    status: "online",
    isExcluded: false,
    region: "დიდუბე-ჩუღურეთი",
    tags: ["offline"],
    position: { x: 45, y: 29 },
    lastSeenAt: "2026-05-27T21:01:00+04:00",
    associatedDevices: ["BioEntry P2", "CoreStation #2"],
    problems: [],
    statusEvents: [
      { id: "e-305-1", deviceId: "dev-305", status: "offline", happenedAt: "2026-05-01T12:15:00+04:00", durationMinutes: 17 },
      { id: "e-305-2", deviceId: "dev-305", status: "offline", happenedAt: "2025-09-19T06:52:00+04:00", durationMinutes: 28 }
    ]
  },
  {
    id: "dev-330",
    code: "TB-330",
    name: "ჩუღურეთი - აღმაშენებელი",
    status: "online",
    isExcluded: false,
    region: "დიდუბე-ჩუღურეთი",
    tags: ["კამერები"],
    position: { x: 55, y: 38 },
    lastSeenAt: "2026-05-27T21:04:00+04:00",
    associatedDevices: ["XPass D2", "Entrance Camera #1"],
    problems: [
      {
        id: "p-330-1",
        title: "კამერის სინქრონიზაცია",
        description: "საჭიროა ვიდეო არქივის დროის გასწორება.",
        status: "resolved",
        reportedAt: "2026-05-10T09:00:00+04:00",
        resolvedAt: "2026-05-10T11:40:00+04:00",
        ownerUserId: "u-giorgi"
      }
    ],
    statusEvents: [
      { id: "e-330-1", deviceId: "dev-330", status: "offline", happenedAt: "2026-03-22T18:40:00+04:00", durationMinutes: 35 }
    ]
  },
  {
    id: "dev-401",
    code: "TB-401",
    name: "გლდანი - სავაჭრო ცენტრი",
    status: "offline",
    isExcluded: false,
    region: "გლდანი-ნაძალადევი",
    tags: ["offline", "UPS", "ელ.პრობლემა"],
    position: { x: 61, y: 22 },
    lastSeenAt: "2026-05-27T18:05:00+04:00",
    associatedDevices: ["BioStation A2", "UPS Sensor", "Secure I/O 2"],
    problems: [
      {
        id: "p-401-1",
        title: "დენის წყვეტები",
        description: "კვირაში რამდენჯერმე ფიქსირდება offline სტატუსი ელკვების დაკარგვის შემდეგ.",
        status: "planned",
        reportedAt: "2026-05-22T17:00:00+04:00",
        plannedAt: "2026-05-28T13:00:00+04:00",
        ownerUserId: "u-levan"
      }
    ],
    statusEvents: [
      { id: "e-401-1", deviceId: "dev-401", status: "offline", happenedAt: "2026-05-27T18:05:00+04:00", durationMinutes: 170 },
      { id: "e-401-2", deviceId: "dev-401", status: "offline", happenedAt: "2026-05-24T07:05:00+04:00", durationMinutes: 70 },
      { id: "e-401-3", deviceId: "dev-401", status: "offline", happenedAt: "2026-05-16T19:05:00+04:00", durationMinutes: 91 },
      { id: "e-401-4", deviceId: "dev-401", status: "offline", happenedAt: "2026-04-09T02:35:00+04:00", durationMinutes: 51 },
      { id: "e-401-5", deviceId: "dev-401", status: "offline", happenedAt: "2026-01-16T22:18:00+04:00", durationMinutes: 44 },
      { id: "e-401-6", deviceId: "dev-401", status: "offline", happenedAt: "2025-08-30T11:24:00+04:00", durationMinutes: 39 }
    ]
  },
  {
    id: "dev-520",
    code: "TB-520",
    name: "ტაბახმელა - საწყობი",
    status: "online",
    isExcluded: false,
    region: "დიდგორი",
    tags: ["offline"],
    position: { x: 35, y: 68 },
    lastSeenAt: "2026-05-27T20:58:00+04:00",
    associatedDevices: ["BioLite N2", "Outdoor Reader"],
    problems: [],
    statusEvents: [
      { id: "e-520-1", deviceId: "dev-520", status: "offline", happenedAt: "2026-04-30T23:20:00+04:00", durationMinutes: 25 }
    ]
  }
];

export const mockTasks: Task[] = [
  {
    id: "task-1",
    title: "TB-101 ქსელის აღდგენა",
    issue: "კონტროლერის ქსელთან კავშირის აღდგენა და პორტის ტესტი.",
    deviceId: "dev-101",
    assigneeIds: ["u-giorgi", "u-maka"],
    status: "planned",
    priority: "urgent",
    startsAt: "2026-05-28T09:30:00+04:00",
    dueDate: "2026-05-28",
    createdAt: "2026-05-27T17:10:00+04:00"
  },
  {
    id: "task-2",
    title: "TB-244 UPS შემოწმება",
    issue: "ძაბვის ჩავარდნის წყაროს პოვნა და UPS battery test.",
    deviceId: "dev-244",
    assigneeIds: ["u-maka"],
    status: "in_progress",
    priority: "high",
    startsAt: "2026-05-27T19:30:00+04:00",
    dueDate: "2026-05-27",
    createdAt: "2026-05-27T15:30:00+04:00"
  },
  {
    id: "task-3",
    title: "TB-401 ელკვების დიაგნოსტიკა",
    issue: "კვების ხაზის შემოწმება, დამიწების და UPS-ის შეცვლის საჭიროების შეფასება.",
    deviceId: "dev-401",
    assigneeIds: ["u-levan"],
    status: "planned",
    priority: "high",
    startsAt: "2026-05-28T13:00:00+04:00",
    dueDate: "2026-05-28",
    createdAt: "2026-05-26T12:15:00+04:00"
  },
  {
    id: "task-4",
    title: "TB-118 firmware ფანჯარა",
    issue: "FaceStation F2 firmware update და BioStar2 sync verification.",
    deviceId: "dev-118",
    assigneeIds: ["u-levan", "u-giorgi"],
    status: "planned",
    priority: "normal",
    startsAt: "2026-05-29T02:00:00+04:00",
    dueDate: "2026-05-29",
    createdAt: "2026-05-25T12:45:00+04:00"
  }
];

export const mockAuditLogs: AuditLog[] = [
  {
    id: "audit-1",
    userId: "u-admin",
    action: "task.create",
    entityType: "task",
    entityId: "task-1",
    metadata: { deviceCode: "TB-101" },
    createdAt: "2026-05-27T17:10:00+04:00"
  },
  {
    id: "audit-2",
    userId: "u-maka",
    action: "task.status_update",
    entityType: "task",
    entityId: "task-2",
    metadata: { status: "in_progress" },
    createdAt: "2026-05-27T19:35:00+04:00"
  }
];

export const findUser = (id: string) => mockUsers.find((user) => user.id === id);
export const findDevice = (id: string) => mockDevices.find((device) => device.id === id);
