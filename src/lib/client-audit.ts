export async function recordAudit(
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, entityType, entityId, metadata })
    });
  } catch {
    // Audit must never block the operator workflow.
  }
}
