# Heal Spot: Initial Design and Implementation Plan

## Product summary

Heal Spot is a single-hospital patient app and staff/admin web panel for OTP
sign-in, doctor discovery, advance token booking, live queue tracking, leave
management, visit history, and secure medical documents. Version 1 excludes
multi-hospital support, online payments, video consultations, pharmacy
workflows, and a doctor-facing app.

## Initial architecture

- **Patient app:** React Native is a reasonable choice for the Android/iOS
  requirement; confirm this choice before implementation.
- **Staff/admin panel:** React web application with role-based screens.
- **API:** Node.js + Express REST API; use WebSockets for queue/status changes
  when practical, with polling as a fallback.
- **Persistence:** PostgreSQL accessed through Prisma. Keep the password out of
  source control and configure `DATABASE_URL` locally, for example:
  `postgresql://postgres:<YOUR_PASSWORD>@localhost:5432/heal_spot?schema=public`.
- **Files:** Store document bytes in private object storage, not PostgreSQL.
  Persist storage keys and metadata; authorize every download and issue short-
  lived signed URLs.
- **External services:** An India-compliant SMS gateway (including DLT setup)
  and Firebase Cloud Messaging for push notifications.

## Initial data model

The first Prisma draft is in [`schema.prisma`](../prisma/schema.prisma).

| Area | Tables | Purpose |
| --- | --- | --- |
| Identity | `PatientAccount`, `PatientProfile`, `OtpChallenge`, `StaffUser` | OTP-based patient accounts, optional linked family profiles, short-lived OTP verification state, and staff roles. |
| Catalogue | `Department`, `Doctor`, `DoctorSchedule`, `DoctorLeave` | Doctor details, department ownership, weekly sessions/token limits, and full- or partial-day leave. |
| Queue | `DoctorDay`, `Booking`, `QueueEvent` | Per-doctor daily status/current token, token reservations and status, and an append-only record of staff queue actions. |
| Visits | `Visit`, `MedicalDocument` | Optional consultation notes and private file metadata attached to a visit. |
| Operations | `Notification`, `OutboxEvent`, `AuditLog`, `HospitalSettings` | Delivery history, retryable external work, staff audit records, and single-hospital configuration. |

Important database decisions:

- Token numbers are unique per doctor and hospital-local date. Booking creation
  must run in a transaction that serializes allocation on the `DoctorDay` row
  (or an equivalent per-doctor/day lock), checks availability and the daily
  limit, and inserts the booking. The database unique constraint is the final
  duplicate-token safeguard.
- Store the fee on each booking as `feeAtBooking`; future doctor fee edits must
  not change historical bookings.
- Use a visit per booking and multiple document metadata rows per visit.
  `storageKey` is not a public URL. Validate PDF/JPG/PNG type and configured
  maximum size before upload.
- Leave creation, affected-booking cancellation, audit records, and outbox
  entries must be committed together. Send SMS/push only after commit; retries
  must not restore cancelled bookings or duplicate notifications.
- `date` uses PostgreSQL `DATE` for the hospital-local booking day; timestamps
  use `timestamptz`. Use the configured hospital timezone for schedule and
  leave calculations.
- Inactive departments/doctors should be retained, not hard-deleted, to
  preserve booking and visit history.

## Delivery plan

1. **Confirm rules and foundation:** settle the open questions below; set up
   React, Express, Prisma/PostgreSQL, configuration, migrations, logging, and
   role-based authentication.
2. **Catalogue and staff panel:** implement department/doctor CRUD, weekly
   schedules, fees, staff accounts, and white/red responsive UI.
3. **Booking and live queue:** implement patient profiles, doctor browsing,
   atomic token allocation, booking/cancellation, walk-ins, queue actions, and
   patient queue updates.
4. **Leave and notifications:** implement leave previews and booking
   cancellation, transactional outbox processing, SMS/push delivery, and
   delivery retries.
5. **Visits and document vault:** implement visit history, staff uploads,
   private storage, access checks, document viewing/download, and audit trails.
6. **Hardening and launch:** add focused tests, security/privacy review, backup
   and restore checks, load/concurrency tests, hospital UAT, staff training, and
   staged production rollout.

## UI direction

Use a clean white foundation with a confident red primary/action color, dark
neutral text, and pale red accents for selected states. Favor generous spacing,
clear typography, accessible contrast, and a consistent card/table system.
Patient booking and queue screens should prioritize the token number, current
token, patients ahead, and doctor status. Staff screens should prioritize
today's queues and high-frequency actions. Do not rely on color alone to
communicate booking or doctor status.

## Decisions to confirm before building

1. Patient cancellation cutoff and advance-booking window.
2. Whether token capacity is per day or per schedule session, and whether
   bookings are time-slot based.
3. Whether a patient can rebook the same doctor on the same day after
   cancellation (the draft does not enforce a one-booking-per-doctor rule).
4. Whether patient-uploaded documents are allowed; the draft permits staff
   uploads only.
5. Whether walk-ins require a patient profile/mobile number and how they are
   ordered relative to app bookings.
6. What happens to remaining tokens when leave begins during clinic hours.
7. Final mobile framework, Tamil localization scope, maximum upload size, and
   SMS/DLT account ownership.

The database schema is an initial draft. Generate and review the first Prisma
migration only after these rules and the development database connection are
confirmed.
