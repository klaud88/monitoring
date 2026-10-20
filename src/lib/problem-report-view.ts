import { hasPermission } from "./permissions";
import type { ProblemReport, SessionUser } from "./types";

/**
 * Drops the linked task's comment and tags from a report unless the viewer's
 * role may see them (problem_reports.task_comment / task_tags). Done on the
 * server, so the values never reach a browser that shouldn't show them.
 */
export function redactTaskFields(
  report: ProblemReport,
  user: SessionUser | null,
): ProblemReport {
  const showComment = hasPermission(user, "problem_reports.task_comment");
  const showTags = hasPermission(user, "problem_reports.task_tags");
  if (showComment && showTags) {
    return report;
  }
  const { taskComment, taskTags, ...rest } = report;
  return {
    ...rest,
    ...(showComment ? { taskComment } : {}),
    ...(showTags ? { taskTags } : {}),
  };
}
