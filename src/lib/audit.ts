import { queryRows } from "./db";

type AuditInput = {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export async function logAudit(input: AuditInput) {
  const id = `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inserted = await queryRows(
    `
      insert into audit_logs
        (id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
      values (?, ?, ?, ?, ?, cast(? as json), ?, ?)
    `,
    [
      id,
      input.userId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.ipAddress ?? null,
      input.userAgent ?? null
    ]
  );

  if (!inserted) {
    console.info("[audit]", {
      id,
      createdAt: new Date().toISOString(),
      ...input
    });
  }
}
