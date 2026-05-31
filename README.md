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
- BioStar2 REST sync from `/api/login` and `/api/devices`; `status=0` maps to offline, `status=1` to online, and `status=2` to error.
- Offline records page at `/offline-records` with 09:00 daily snapshots, threshold highlighting, and selected device monitoring.
- Google Static Maps is used as the dashboard background when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured; BioStar2 device pins are rendered above the static image.
- Task rail and task management page with device/user assignment.
- Dedicated task detail pages under `/tasks/[id]`.
- Device details with associated devices and issue resolution timeline.
- Device insertion and region/tag assignment page.
- User management page.
- Role and permission management page with hidden-tab support.
- Offline analytics with date range filters for devices, regions, and tags.
- Audit logging for auth, task, filter, assignment, region, and permission actions.

## BioStar2 and offline capture

Set `BIOSTAR2_BASE_URL`, `BIOSTAR2_USERNAME`, and `BIOSTAR2_PASSWORD` in `.env`. The default base URL is `https://devices.tbilisikids.com`.
If that internal server returns a certificate purpose error from Node.js, set `BIOSTAR2_TLS_REJECT_UNAUTHORIZED=false` or fix the server certificate.

For exact 09:00 capture, schedule:

```bash
curl -X POST "$APP_URL/api/cron/offline-capture" -H "Authorization: Bearer $OFFLINE_CAPTURE_SECRET"
```

The `/offline-records` page also backfills today's snapshot after 09:00 when it is opened.
