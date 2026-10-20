import type { SessionUser } from "@/lib/types";

/**
 * Top of the "მომხმარებლის მონაცემები" card on the task and problem-report
 * pages: who filled the form in and how to reach them. The garden's own
 * details follow below it on each page.
 */
export function AuthorRows({ author }: { author?: SessionUser }) {
  const phone = author?.phone?.trim();
  // Generated garden accounts carry a placeholder address, not a real one.
  const email =
    author?.email && !author.email.endsWith("@local.ge") ? author.email : "";

  return (
    <dl className="detail-list author-list">
      <div>
        <dt>ავტორი</dt>
        <dd>{author?.name ?? "უცნობი"}</dd>
      </div>
      <div>
        <dt>ტელეფონი</dt>
        <dd>
          {phone ? (
            <a className="inline-link" href={`tel:${phone.replace(/\s+/g, "")}`}>
              {phone}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div>
        <dt>ელფოსტა</dt>
        <dd>
          {email ? (
            <a className="inline-link" href={`mailto:${email}`}>
              {email}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </div>
    </dl>
  );
}
