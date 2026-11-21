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
  and admin responsibilities. Shared HTTP requests are in
  `apps/web/src/api/client.js`.
- The frontend style entry point is `apps/web/src/styles.css`; its imports
  split base, landing, auth, and admin rules into `apps/web/src/styles`.

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
  and manage roles, access, and password resets after signing in.
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
- Apply the additive Phase 1 schema migration with
  `npm run db:migrate -- --name phase1_admin_fields`.

Patient booking, live queue data, SMS notifications, leave workflows, and the
document vault remain future phases.
