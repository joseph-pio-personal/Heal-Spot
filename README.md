# Heal Spot

Heal Spot is a single-hospital patient and staff application for doctor
discovery, token booking, live queue tracking, visit history, and medical
documents.

## Stack

- React + Vite frontend (`apps/web`)
- Node.js + Express API (`apps/api`)
- PostgreSQL + Prisma ORM

## Source layout

- API route modules live in `apps/api/src/routes`: authentication, admin staff,
  departments, and doctors each have their own router.
- Shared API concerns are separated into `apps/api/src/auth`,
  `apps/api/src/middleware`, `apps/api/src/catalog`, and `apps/api/src/lib`.
- Frontend pages are grouped under `apps/web/src/features` by landing, auth,
  admin, patient, and staff responsibilities. Shared HTTP requests are in
  `apps/web/src/api/client.js`.
- The frontend style entry point is `apps/web/src/styles.css`; its imports
  split base, landing, auth, admin, and operations rules into
  `apps/web/src/styles`.

## Local setup

1. Install Node.js 20 or later and PostgreSQL. Create a local database named
   `heal_spot`.
2. Copy the root `.env.example` to `.env` and set your PostgreSQL password.
   The root `.env` is shared by Prisma and the API and must never be committed.
3. Copy `apps/api/.env.example` to `apps/api/.env`.
4. Copy `apps/web/.env.example` to `apps/web/.env.local`.
5. Install each app's dependencies and generate the API-local Prisma client:

   ```sh
   npm install --prefix apps/api --workspaces=false
   npm install --prefix apps/web --workspaces=false
   npm run db:generate
   ```

6. Apply the existing development migration:

   ```sh
   npm run db:migrate -- --name init
   ```

7. Start the API and web app in separate terminals:

   ```sh
   npm run dev:api
   npm run dev:web
   ```

The web app is served at `http://localhost:5173`. The API health check is
available at `http://localhost:4000/api/health`; database readiness is checked
at `http://localhost:4000/api/health/ready`.
When opening the web app through a LAN IP or another hostname, the API client
uses the browser hostname instead of a configured `localhost`/loopback URL so
the sign-in cookie stays on the same host. Add the frontend origin to
`CORS_ORIGIN` in `apps/api/.env`, then restart the API and Vite dev server.

## Authentication

- Patients register with their name, email, username, and password, then sign
  in with either their email or username and password. Mobile is optional
  contact information and is not used for authentication. Patient
  authentication does not send SMS messages or use OTP codes.
- Receptionist, nurse, and admin accounts use email and password. Public staff
  registration is intentionally unavailable. Bootstrap the first admin
  locally with `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and
  `BOOTSTRAP_ADMIN_PASSWORD` set in the environment, then run
  `npm run admin:create`. The script only works
  before an admin account exists. An admin can create further staff accounts
  and manage roles, access, and password resets after signing in. Staff can
  change their password from My Profile by confirming the current password;
  doing so signs out other active sessions.
- Doctors sign in with the work email and temporary password configured by an
  admin in the doctor directory. They can change the temporary password from
  My Profile after signing in.
- Every account has a My Profile page. Patients can upload a separate photo
  for each patient/family profile; doctors, staff, and admins can upload an
  account photo. JPEG, PNG, and WebP files up to 5 MB are stored locally under
  `apps/api/uploads/profile-images` and are excluded from Git.
- The API keeps its session in an HTTP-only cookie. Keep `JWT_SECRET` private
  and set a new random value of at least 32 characters in `apps/api/.env`.
- Prisma CLI/client dependencies are installed inside `apps/api/node_modules`.
  The schema and migrations live in `apps/api/prisma`.
- For the first administrator, set `BOOTSTRAP_ADMIN_NAME`,
  `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` in the shell that
  runs the bootstrap command; do not save bootstrap credentials in a committed
  file. The password must be 12-72 bytes.

## Phase 1: Foundation

The admin workspace supports department management, doctor profiles, weekly
clinic sessions and token capacities, consultation fees, and staff account
management. Catalog changes are audit logged. Staff role changes, deactivation,
and password resets revoke existing sessions; an admin cannot disable their
own account or the last active admin.

- Public catalog: `GET /api/departments` and
  `GET /api/doctors?departmentId=<uuid>&search=<text>`.
- Admin catalog: `GET/POST /api/admin/departments`,
  `PATCH /api/admin/departments/:id`, `GET/POST /api/admin/doctors`, and
  `PATCH /api/admin/doctors/:id`.
- Admin staff: `GET/POST /api/auth/admin/staff`,
  `PATCH /api/auth/admin/staff/:id`, and
  `POST /api/auth/admin/staff/:id/reset-password`.
- Staff password change: `POST /api/auth/staff/change-password`.
- Patient password change: `POST /api/auth/patient/change-password`.
- Doctor sign-in and password change: `POST /api/auth/doctor/login` and
  `POST /api/auth/doctor/change-password`.
- Account profile: `GET /api/profile`; authenticated photo upload/read routes
  are `PUT/GET /api/profile/photo` for staff/doctors and
  `PUT/GET /api/profile/photo/:profileId` for patient profiles.
- Apply the all-role account and profile-photo schema migration with
  `npm run db:migrate -- --name all_role_profiles`.
- Apply the additive Phase 1 schema migration with
  `npm run db:migrate -- --name phase1_admin_fields`.

## Phase 2: Patient bookings and live queues

Patients can create and edit patient profiles, browse date-specific doctor
availability, book tokens, review or cancel bookings before they are called,
and track queue progress. Doctor cards show whether booking is available, why
a doctor is unavailable, the remaining tokens versus total capacity, and
refresh availability every 10 seconds. Booking is available from the
hospital's current date through seven calendar days ahead. A profile can hold
one active booking per doctor per day, so it can book different doctors on the same day. Daily
capacity combines all active sessions for that doctor and weekday; cancelled
tokens release capacity but token numbers are not reused.

Receptionists, nurses, and admins can view a doctor's daily queue, update the
doctor's daily status, call the next token, recall the current token, skip it,
or mark it complete. Queue actions are limited to the current hospital day,
and a doctor must be marked Present before staff can manage the queue. Walk-in
booking and SMS/OTP delivery are not part of this phase.
Doctors have a read-only dashboard for their own daily schedule and patient
queue; queue operations remain with authorized hospital staff.

- Patient profiles: `GET/POST /api/patient/profiles` and
  `PATCH /api/patient/profiles/:id`.
- Patient bookings: `GET /api/bookings/availability?date=YYYY-MM-DD`,
  `GET/POST /api/bookings`, `GET /api/bookings/:id/tracking`, and
  `DELETE /api/bookings/:id`.
- Staff queue: `GET /api/staff/queue?doctorId=<uuid>&date=YYYY-MM-DD`,
  `PATCH /api/staff/queue/:doctorId/status`, and
  `POST /api/staff/queue/:doctorId/actions`.
- Doctor dashboard: `GET /api/doctor/dashboard` returns the signed-in doctor's
  schedule and current-day queue only.

The Phase 2 booking and queue models were included in the initial schema, so
this phase does not add a database migration. Patient tracking polls the API
every 10 seconds while its panel is open.

Leave workflows, walk-in tokens, notifications, and the medical document vault
remain future phases.
