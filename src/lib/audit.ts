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
  try {
    await queryRows(
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
        input.userAgent ?? null,
      ],
    );
  } catch (error) {
    console.warn("[audit] DB insert failed", {
      id,
      action: input.action,
      entityType: input.entityType,
      error,
    });
  }
}

/* A task and its problem report are deleted and restored together, so each
   side that was touched gets its own audit entry. */
export async function logTaskPairAudit(
  request: Request,
  userId: string,
  action: "delete" | "restore",
  pair: { taskId?: string; problemReportId?: string },
) {
  const ipAddress = request.headers.get("x-forwarded-for") ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;
  if (pair.taskId) {
    await logAudit({
      userId,
      action: `task.${action}`,
      entityType: "task",
      entityId: pair.taskId,
      metadata: pair.problemReportId
        ? { problemReportId: pair.problemReportId }
        : undefined,
      ipAddress,
      userAgent,
    });
  }
  if (pair.problemReportId) {
    await logAudit({
      userId,
      action: `problem_report.${action}`,
      entityType: "problem_report",
      entityId: pair.problemReportId,
      metadata: pair.taskId ? { taskId: pair.taskId } : undefined,
      ipAddress,
      userAgent,
    });
  }
}
