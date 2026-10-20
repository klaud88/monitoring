import { Mail, Phone } from "lucide-react";
import type { SessionUser } from "@/lib/types";

/**
 * Top of the "მომხმარებლის მონაცემები" card on the task and problem-report
 * pages: who reported it and who to call at the garden. The garden's own
 * details follow below it on each page.
 */
export function PeopleSection({
  reporter,
  reporterRole,
  gardenContacts,
}: {
  reporter?: SessionUser;
  reporterRole?: string;
  gardenContacts: SessionUser[];
}) {
  return (
    <div className="people-section">
      <h3 className="detail-subhead">დამფიქსირებელი</h3>
      {reporter ? (
        <PersonContact user={reporter} note={reporterRole} />
      ) : (
        <p className="muted">უცნობია.</p>
      )}

      <h3 className="detail-subhead">ბაღის კონტაქტი</h3>
      {gardenContacts.length ? (
        <div className="detail-people">
          {gardenContacts.map((contact) => (
            <PersonContact key={contact.id} user={contact} />
          ))}
        </div>
      ) : (
        <p className="muted">კონტაქტი არ არის.</p>
      )}

      <h3 className="detail-subhead">ბაღის მონაცემები</h3>
    </div>
  );
}

function PersonContact({ user, note }: { user: SessionUser; note?: string }) {
  return (
    <div className="person-contact">
      <div className="detail-person">
        <span className="avatar" style={{ backgroundColor: user.color }}>
          {user.initials}
        </span>
        <span className="detail-person-copy">
          <strong>{user.name}</strong>
          {note ? <small>{note}</small> : null}
        </span>
      </div>
      <div className="person-contact-lines">
        {user.phone ? (
          <a href={`tel:${user.phone.replace(/\s+/g, "")}`}>
            <Phone size={13} />
            {user.phone}
          </a>
        ) : null}
        {user.email && !user.email.endsWith("@local.ge") ? (
          <a href={`mailto:${user.email}`}>
            <Mail size={13} />
            {user.email}
          </a>
        ) : null}
      </div>
    </div>
  );
}
