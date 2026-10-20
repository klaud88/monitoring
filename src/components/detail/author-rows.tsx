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
        <dd>
          {author ? (
            <span
              className="author-chip"
              style={{ backgroundColor: author.color, color: readableOn(author.color) }}
              title={author.name}
            >
              {author.name}
            </span>
          ) : (
            "უცნობი"
          )}
        </dd>
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

/** White on dark colours, dark on light ones, so any user colour reads. */
function readableOn(color: string) {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return "#fff";
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#1f2937" : "#fff";
}
