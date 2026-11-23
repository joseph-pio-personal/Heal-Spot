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
Successful patient bookings send a confirmation email to the patient's account
email. Email delivery failures do not undo bookings. For Gmail, set
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and
`MAIL_FROM` in `apps/api/.env`; `SMTP_PASS` must be a Google App Password, not
the account password. The API environment template is `apps/api/.env.example`.

Receptionists, nurses, and admins can view a doctor's daily queue, update the
doctor's daily status, call the next token, recall the current token, skip it,
or mark it complete. Queue actions are limited to the current hospital day,
and a doctor must be marked Present before staff can manage the queue. Walk-in
booking and SMS/push delivery are not part of this phase.
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

## Phase 3: Email notifications, doctor leave, and prescriptions

New patient registrations receive a six-digit email verification code, which
they enter on the registration screen to verify their address and sign in
immediately. Codes expire after 10 minutes and allow up to five attempts;
patients can request a replacement code. Subsequent visits use the regular
email/username and password sign-in flow. Existing accounts are marked verified
by the email-outbox migration to preserve access.
Booking confirmations and cancellations, doctor-leave cancellations, and
two-positions-away queue alerts are added to a transactional email outbox.
Failed deliveries are retried with backoff; email failures do not roll back
bookings or visits. Appointment reminders are queued at 07:00 on the day before
the appointment, and each doctor with an email receives a daily booking count
at 07:00, including zero-booking days. These schedules use the hospital
timezone from settings (default `Asia/Kolkata`).

Receptionists, nurses, and admins can record doctor leave. Leave cancels
affected booked appointments and queues patient emails; a leave range is
rejected if it includes a currently called token. Staff can upload a
prescription after a visit is completed. Patients receive a sign-in-required
link to download their own prescription; files are not attached to emails.
Development stores private documents locally in `apps/api/uploads`, which is
ignored by Git. Configure private object storage before production deployment.

Configure Gmail SMTP values in `apps/api/.env`, keep credentials out of Git,
then regenerate the Prisma client and apply the email migrations:

```sh
npm run db:generate
npm run db:migrate -- --name email_outbox
npm run db:migrate -- --name patient_email_otp
```

The worker starts with the API and polls the outbox every five seconds. The
hospital timezone can be set in hospital settings; the default is
`Asia/Kolkata`.

## Phase 4: Doctor-authored prescriptions

Doctors can create a prescription for a booking in their own queue once the
token is called or the visit is completed. Drafts are doctor-only until
finalized; finalization requires at least one medication and locks that
version. A later correction is recorded as a new amendment version instead of
overwriting the issued prescription. Each medication records clinician-entered
name, strength, dosage, route, frequency, duration, quantity, and instructions.
The application does not recommend medications or generate treatment advice.

Patients can view finalized prescriptions in their account or open the private
email link after signing in, then print or save the page as a PDF. Prescription
view access and doctor draft/finalization actions are audit logged. Staff file
uploads remain available for scanned prescriptions and other visit documents.
New API routes are under `/api/doctor/prescriptions` and
`/api/patient/prescriptions`:

- Doctors: `GET/POST /api/doctor/prescriptions/bookings/:bookingId`,
  `PUT /api/doctor/prescriptions/:prescriptionId`, and
  `POST /api/doctor/prescriptions/:prescriptionId/finalize`.
- Patients: `GET /api/patient/prescriptions` and
  `GET /api/patient/prescriptions/:prescriptionId`.

Apply the additive schema change with:

```sh
npm run db:generate
npm run db:migrate -- --name doctor_prescriptions
```
