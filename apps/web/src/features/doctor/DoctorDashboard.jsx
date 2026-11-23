import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  Clock3,
  RefreshCw,
  Stethoscope,
  Users,
} from "lucide-react";
import { apiRequest } from "../../api/client.js";
import DoctorPrescriptionEditor from "./DoctorPrescriptionEditor.jsx";

function statusLabel(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function DoctorDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState("");
  const [prescriptionBookingId, setPrescriptionBookingId] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest("/api/doctor/dashboard");
        if (active) {
          setDashboard(result);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshVersion]);

  const bookings = dashboard?.bookings ?? [];
  const waitingCount = bookings.filter((booking) => booking.status === "BOOKED").length;
  const completedCount = bookings.filter((booking) => booking.status === "COMPLETED").length;
  const currentBooking = bookings.find((booking) => (
    booking.status === "CALLED"
    && booking.tokenNumber === dashboard?.doctorDay.currentTokenNumber
  ));

  return (
    <section className="operations-dashboard doctor-dashboard" aria-label="Doctor dashboard">
      <header className="operations-header">
        <div>
          <span className="eyebrow"><Activity size={13} /> DOCTOR DASHBOARD</span>
          <h2>{dashboard ? `Welcome, ${dashboard.doctor.name}.` : "Your clinic at a glance."}</h2>
          <p>
            {dashboard
              ? `${dashboard.doctor.department.name}${dashboard.doctor.specialization ? ` · ${dashboard.doctor.specialization}` : ""} · ${formatDate(dashboard.date)}`
              : "Your schedule and today’s patient queue, in one place."}
          </p>
        </div>
        <button
          className="admin-refresh"
          disabled={loading}
          onClick={() => setRefreshVersion((current) => current + 1)}
          type="button"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && <p className="form-message form-error" role="alert">{error}</p>}

      {loading && !dashboard ? (
        <div className="admin-loading"><RefreshCw size={16} /> Loading your dashboard...</div>
      ) : dashboard ? (
        <>
          <section className="doctor-dashboard-stats" aria-label="Today's queue summary">
            <article className="doctor-stat-card">
              <span><Activity size={14} /> Doctor status</span>
              <strong className={`operations-status operations-status-${dashboard.doctorDay.status.toLowerCase()}`}>
                {statusLabel(dashboard.doctorDay.status)}
              </strong>
            </article>
            <article className="doctor-stat-card">
              <span><Stethoscope size={14} /> Now serving</span>
              <strong>{dashboard.doctorDay.currentTokenNumber || "—"}</strong>
              {currentBooking && <small>{currentBooking.patientProfile.name}</small>}
            </article>
            <article className="doctor-stat-card">
              <span><Users size={14} /> Waiting</span>
              <strong>{waitingCount}</strong>
            </article>
            <article className="doctor-stat-card">
              <span><Check size={14} /> Completed</span>
              <strong>{completedCount}</strong>
            </article>
          </section>

          <section className="admin-panel doctor-schedule-panel">
            <div className="admin-panel-heading">
              <div className="admin-panel-icon"><CalendarDays size={16} /></div>
              <div>
                <h3>Today&apos;s clinic sessions</h3>
                <p>{dashboard.date} · {dashboard.timeZone}</p>
              </div>
            </div>
            {dashboard.doctor.todaySessions.length === 0 ? (
              <p className="admin-empty">No clinic sessions are scheduled for today.</p>
            ) : (
              <div className="doctor-session-list">
                {dashboard.doctor.todaySessions.map((session) => (
                  <article className="doctor-session-card" key={session.id}>
                    <span className="doctor-session-icon"><Clock3 size={16} /></span>
                    <div>
                      <strong>{session.startTime}–{session.endTime}</strong>
                      <span>{session.maxTokens} token capacity</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="admin-panel doctor-queue-panel">
            <div className="admin-panel-heading">
              <div className="admin-panel-icon"><Users size={16} /></div>
              <div>
                <h3>Today&apos;s patient queue <span className="admin-count">{bookings.length}</span></h3>
                <p>Queue information refreshes automatically every 10 seconds.</p>
              </div>
            </div>
            {bookings.length === 0 ? (
              <p className="admin-empty">There are no bookings in your queue today.</p>
            ) : (
              <div className="doctor-queue-bookings">
                {bookings.map((booking) => (
                  <div className="doctor-queue-booking" key={booking.id}>
                    <article
                      className={`staff-token-row${booking.status === "CALLED" ? " staff-token-current" : ""}`}
                    >
                      <span className="patient-booking-token">#{booking.tokenNumber}</span>
                      <div className="patient-booking-copy">
                        <strong>{booking.patientProfile.name}</strong>
                        <span>
                          {booking.status === "CALLED"
                            ? "Currently being called"
                            : `Booked ${new Date(booking.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        </span>
                      </div>
                      <span className={`operations-status operations-status-${booking.status.toLowerCase()}`}>
                        {statusLabel(booking.status)}
                      </span>
                      {["CALLED", "COMPLETED"].includes(booking.status) && (
                        <button
                          className="admin-row-action doctor-prescription-open"
                          onClick={() => setPrescriptionBookingId((current) => current === booking.id ? "" : booking.id)}
                          type="button"
                        >
                          {prescriptionBookingId === booking.id ? "Close" : "Prescription"}
                        </button>
                      )}
                    </article>
                    {prescriptionBookingId === booking.id && (
                      <DoctorPrescriptionEditor
                        bookingId={booking.id}
                        onClose={() => setPrescriptionBookingId("")}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <p className="operations-footnote doctor-dashboard-note">
            Queue status and patient details are private to your account. Queue operations remain available to authorized hospital staff.
          </p>
        </>
      ) : null}
    </section>
  );
}

export default DoctorDashboard;
