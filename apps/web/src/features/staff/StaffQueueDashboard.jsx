import { useEffect, useState } from "react";
import { Activity, BellRing, Check, Clock3, RefreshCw, SkipForward, Stethoscope, Users } from "lucide-react";
import { apiRequest } from "../../api/client.js";

const DOCTOR_STATUSES = ["NOT_YET_ARRIVED", "PRESENT", "ON_BREAK", "ON_LEAVE"];

function hospitalDateToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function statusLabel(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StaffQueueDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [queue, setQueue] = useState({ doctorDay: { status: "NOT_YET_ARRIVED", currentTokenNumber: 0 }, bookings: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const date = hospitalDateToday();

  useEffect(() => {
    let active = true;
    apiRequest("/api/doctors")
      .then(({ doctors: result }) => {
        if (!active) return;
        const activeDoctors = result.filter((doctor) => doctor.status === "ACTIVE");
        setDoctors(activeDoctors);
        setDoctorId((current) => (
          activeDoctors.some((doctor) => doctor.id === current)
            ? current
            : activeDoctors[0]?.id ?? ""
        ));
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!doctorId) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest(`/api/staff/queue?doctorId=${encodeURIComponent(doctorId)}&date=${date}`);
        if (active) {
          setQueue(result);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [date, doctorId, refreshVersion]);

  const updateDoctorStatus = async (status) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/staff/queue/${doctorId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ date, status }),
      });
      setNotice(`Doctor status updated to ${statusLabel(status)}.`);
      setRefreshVersion((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action, bookingId) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { booking } = await apiRequest(`/api/staff/queue/${doctorId}/actions`, {
        method: "POST",
        body: JSON.stringify({ date, action, ...(bookingId ? { bookingId } : {}) }),
      });
      setNotice(action === "CALL_NEXT"
        ? `Token ${booking.tokenNumber} has been called.`
        : `Token ${booking.tokenNumber}: ${statusLabel(action)}.`);
      setRefreshVersion((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const currentBooking = queue.bookings.find((booking) => (
    booking.status === "CALLED" && booking.tokenNumber === queue.doctorDay.currentTokenNumber
  ));
  const waitingCount = queue.bookings.filter((booking) => booking.status === "BOOKED").length;

  return (
    <section className="operations-dashboard staff-queue-dashboard" aria-label="Staff queue management">
      <header className="operations-header">
        <div>
          <span className="eyebrow"><Activity size={13} /> LIVE OPERATIONS</span>
          <h2>Today&apos;s doctor queues.</h2>
          <p>Update doctor availability and manage the patient token sequence.</p>
        </div>
        <button
          className="admin-refresh"
          disabled={loading || !doctorId}
          onClick={() => setRefreshVersion((current) => current + 1)}
          type="button"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message form-success" role="status">{notice}</p>}

      <div className="staff-queue-overview">
        <section className="admin-panel staff-queue-settings">
          <div className="admin-panel-heading">
            <div className="admin-panel-icon"><Stethoscope size={16} /></div>
            <div>
              <h3>Queue controls</h3>
              <p>{date} · Queue changes are limited to today.</p>
            </div>
          </div>
          {loading ? (
            <div className="admin-loading"><RefreshCw size={16} /> Loading doctors...</div>
          ) : doctors.length === 0 ? (
            <p className="admin-empty">There are no active doctors to manage.</p>
          ) : (
            <>
              <label className="operations-field">
                Doctor
                <select
                  value={doctorId}
                  onChange={(event) => {
                    setQueue({
                      doctorDay: { status: "NOT_YET_ARRIVED", currentTokenNumber: 0 },
                      bookings: [],
                    });
                    setDoctorId(event.target.value);
                  }}
                >
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.department.name}</option>
                  ))}
                </select>
              </label>
              <label className="operations-field staff-status-field">
                Doctor&apos;s status
                <select
                  disabled={busy}
                  onChange={(event) => updateDoctorStatus(event.target.value)}
                  value={queue.doctorDay.status}
                >
                  {DOCTOR_STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <div className="staff-queue-action-buttons">
                <button
                  className="button staff-call-button"
                  disabled={busy || queue.doctorDay.status !== "PRESENT" || waitingCount === 0 || Boolean(currentBooking)}
                  onClick={() => runAction("CALL_NEXT")}
                  type="button"
                >
                  <BellRing size={14} /> Call next token
                </button>
                {currentBooking && (
                  <div className="staff-current-actions">
                    <span>Currently called: <strong>#{currentBooking.tokenNumber}</strong></span>
                    <div>
                      <button
                        className="admin-secondary-button"
                        disabled={busy}
                        onClick={() => runAction("RECALL", currentBooking.id)}
                        type="button"
                      >
                        <BellRing size={13} /> Recall
                      </button>
                      <button
                        className="admin-secondary-button"
                        disabled={busy}
                        onClick={() => runAction("SKIP", currentBooking.id)}
                        type="button"
                      >
                        <SkipForward size={13} /> Skip
                      </button>
                      <button
                        className="admin-secondary-button"
                        disabled={busy}
                        onClick={() => runAction("COMPLETE", currentBooking.id)}
                        type="button"
                      >
                        <Check size={13} /> Complete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <section className="admin-panel staff-queue-summary">
          <div className="admin-panel-heading">
            <div className="admin-panel-icon"><Clock3 size={16} /></div>
            <div>
              <h3>Queue snapshot</h3>
              <p>Automatically refreshed every 10 seconds.</p>
            </div>
          </div>
          <div className="staff-queue-stats">
            <div><span>Doctor status</span><strong>{statusLabel(queue.doctorDay.status)}</strong></div>
            <div><span>Now serving</span><strong>{queue.doctorDay.currentTokenNumber || "—"}</strong></div>
            <div><span>Waiting</span><strong>{waitingCount}</strong></div>
            <div><span>Total tokens</span><strong>{queue.bookings.length}</strong></div>
          </div>
          <p className="operations-footnote"><Activity size={14} /> Queue controls are available to authorized hospital staff.</p>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div className="admin-panel-icon"><Users size={16} /></div>
          <div>
            <h3>Token list</h3>
            <p>Patients are shown in token order; private contact details are not displayed.</p>
          </div>
        </div>
        {loading ? (
          <div className="admin-loading"><RefreshCw size={16} /> Loading queue...</div>
        ) : queue.bookings.length === 0 ? (
          <p className="admin-empty">No bookings are in this doctor&apos;s queue today.</p>
        ) : (
          <div className="staff-token-list">
            {queue.bookings.map((booking) => (
              <article
                className={`staff-token-row${booking.status === "CALLED" ? " staff-token-current" : ""}`}
                key={booking.id}
              >
                <span className="patient-booking-token">#{booking.tokenNumber}</span>
                <div className="patient-booking-copy">
                  <strong>{booking.patientProfile.name}</strong>
                  <span>{booking.status === "CALLED" ? "Currently being called" : `Booked ${new Date(booking.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span>
                </div>
                <span className={`operations-status operations-status-${booking.status.toLowerCase()}`}>
                  {statusLabel(booking.status)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export default StaffQueueDashboard;
