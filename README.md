# BioStar2 Status Ops

Next.js + MySQL dashboard for BioStar2 device status monitoring, task planning, permissions, and audit logging.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Development login:

- Email: `admin@local.ge`
- Password: `admin123`

## Database

Create the database and load the schema:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p biostar_status_ops < database/seed.sql
```

The app works with mock data when MySQL is not configured. Once `.env.local` points to MySQL, API routes use the database layer.

## Main modules

- Dashboard map with device status, region/tag/user filters, and assigned user badges above device pins.
- Google Static Maps is used as the dashboard background when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured; BioStar2 device pins are rendered above the static image.
- Task rail and task management page with device/user assignment.
- Dedicated task detail pages under `/tasks/[id]`.
- Device details with associated devices and issue resolution timeline.
- Device insertion and region/tag assignment page.
- User management page.
- Role and permission management page with hidden-tab support.
- Offline analytics with date range filters for devices, regions, and tags.
- Audit logging for auth, task, filter, assignment, region, and permission actions.
