import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Clock3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { apiRequest } from "../../api/client.js";
import Pagination, { usePagination } from "../admin/Pagination.jsx";

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

function formatCurrency(value) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusLabel(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function availabilityReasonLabel(reason) {
  return {
    NO_CLINIC_SESSIONS: "No clinic sessions on this date",
    DOCTOR_ON_LEAVE: "Doctor is on leave",
    NO_TOKENS_REMAINING: "All tokens have been booked",
    CLINIC_SESSIONS_ENDED: "Today's clinic sessions have ended",
  }[reason] ?? "Not accepting bookings";
}

function PatientDashboard() {
  const [profiles, setProfiles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState({ doctors: [], bookingThrough: "" });
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedDate, setSelectedDate] = useState(hospitalDateToday);
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [profileForm, setProfileForm] = useState({ name: "", mobile: "", relationship: "SELF" });
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileEditingId, setProfileEditingId] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [notice, setNotice] = useState("");
  const { page, pageCount, pageRecords, setPage } = usePagination(availability.doctors);

  useEffect(() => {
    setPage(1);
  }, [departmentId, search, selectedDate, setPage]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest("/api/patient/profiles"),
      apiRequest("/api/departments"),
      apiRequest("/api/bookings"),
    ])
      .then(([profileResult, departmentResult, bookingResult]) => {
        if (!active) return;
        setProfiles(profileResult.profiles);
        setDepartments(departmentResult.departments);
        setBookings(bookingResult.bookings);
        setSelectedProfileId((current) => (
          profileResult.profiles.some((profile) => profile.id === current)
            ? current
            : profileResult.profiles[0]?.id ?? ""
        ));
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    setAvailabilityLoading(true);
    const loadAvailability = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      const params = new URLSearchParams({ date: selectedDate });
      if (departmentId) params.set("departmentId", departmentId);
      if (search.trim()) params.set("search", search.trim());
      try {
        const result = await apiRequest(`/api/bookings/availability?${params}`);
        if (active) {
          setAvailability(result);
          setAvailabilityError("");
        }
      } catch (requestError) {
        if (active) setAvailabilityError(requestError.message);
      } finally {
        requestInFlight = false;
        if (active) setAvailabilityLoading(false);
      }
    };
    const timer = setTimeout(loadAvailability, 180);
    const interval = setInterval(loadAvailability, 10_000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [departmentId, refreshVersion, search, selectedDate]);

  useEffect(() => {
    if (!trackingId) return undefined;
    let active = true;
    const loadTracking = async () => {
      try {
        const result = await apiRequest(`/api/bookings/${trackingId}/tracking`);
        if (active) {
          setTracking(result);
          setTrackingError("");
        }
      } catch (requestError) {
        if (active) setTrackingError(requestError.message);
      }
    };
    loadTracking();
    const interval = setInterval(loadTracking, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [trackingId]);

  const createProfile = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy("profile");
    try {
      const { profile } = await apiRequest(
        profileEditingId ? `/api/patient/profiles/${profileEditingId}` : "/api/patient/profiles",
        {
        method: profileEditingId ? "PATCH" : "POST",
        body: JSON.stringify(profileForm),
        },
      );
      setProfiles((current) => profileEditingId
        ? current.map((item) => item.id === profile.id ? profile : item)
        : [...current, profile]);
      setSelectedProfileId(profile.id);
      setProfileEditingId("");
      setProfileForm({ name: "", mobile: "", relationship: "SELF" });
      setShowProfileForm(false);
      setNotice(profileEditingId ? `${profile.name}'s profile was updated.` : `${profile.name}'s profile was added.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const editSelectedProfile = () => {
    const profile = profiles.find((item) => item.id === selectedProfileId);
    if (!profile) return;
    setProfileEditingId(profile.id);
    setProfileForm({
      name: profile.name,
      mobile: profile.mobile ?? "",
      relationship: profile.relationship ?? "FAMILY",
    });
    setShowProfileForm(true);
  };

  const toggleAddProfile = () => {
    if (showProfileForm && !profileEditingId) {
      setShowProfileForm(false);
      return;
    }
    setProfileEditingId("");
    setProfileForm({ name: "", mobile: "", relationship: "SELF" });
    setShowProfileForm(true);
  };

  const createBooking = async (doctorId) => {
    if (!selectedProfileId) {
      setError("Select or add a patient profile before booking.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(doctorId);
    try {
      const { booking, emailStatus } = await apiRequest("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ profileId: selectedProfileId, doctorId, date: selectedDate }),
      });
      const emailNotice = {
        QUEUED: " Confirmation email queued.",
        NOT_CONFIGURED: " Email sending is not configured yet.",
        NO_RECIPIENT: " No email address is linked to your patient account.",
        FAILED: " Confirmation email could not be sent; please contact the clinic if needed.",
      }[emailStatus] ?? "";
      setNotice(`Token ${booking.tokenNumber} is booked for ${booking.patientProfile.name}.${emailNotice}`);
      setTrackingId(booking.id);
      setRefreshVersion((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const cancelBooking = async (bookingId) => {
    setError("");
    setNotice("");
    setBusy(bookingId);
    try {
      await apiRequest(`/api/bookings/${bookingId}`, { method: "DELETE" });
      setNotice("Booking cancelled. Its capacity is available again.");
      setRefreshVersion((current) => current + 1);
      if (trackingId === bookingId) setTrackingId("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const alreadyBooked = (doctorId) => bookings.some((booking) => (
    booking.doctor.id === doctorId
    && booking.patientProfile.id === selectedProfileId
    && booking.date === selectedDate
    && ["BOOKED", "CALLED"].includes(booking.status)
  ));

  return (
    <section className="operations-dashboard patient-dashboard" aria-label="Patient bookings">
      <header className="operations-header">
        <div>
          <span className="eyebrow"><CalendarDays size={13} /> PATIENT SERVICES</span>
          <h2>Book and follow your care.</h2>
          <p>Choose a profile, find an available doctor, and track your token.</p>
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
      {notice && <p className="form-message form-success" role="status">{notice}</p>}

      <div className="patient-booking-controls">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div className="admin-panel-icon"><Users size={16} /></div>
            <div>
              <h3>Who needs care?</h3>
              <p>Choose one of your patient profiles.</p>
            </div>
          </div>
          {loading ? (
            <div className="admin-loading"><RefreshCw size={16} /> Loading profiles...</div>
          ) : profiles.length > 0 ? (
            <label className="operations-field">
              Patient profile
              <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}{profile.relationship ? ` · ${statusLabel(profile.relationship)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="admin-empty">Add a profile before booking a token.</p>
          )}
          <div className="profile-actions">
            <button className="admin-secondary-button" onClick={toggleAddProfile} type="button">
              <Plus size={14} /> Add patient profile
            </button>
            <button
              className="admin-secondary-button"
              disabled={!selectedProfileId}
              onClick={editSelectedProfile}
              type="button"
            >
              Edit selected
            </button>
            {showProfileForm && (
              <button
                className="admin-row-action"
                onClick={() => { setShowProfileForm(false); setProfileEditingId(""); }}
                type="button"
              >
                Close
              </button>
            )}
          </div>
          {showProfileForm && (
            <form className="operations-form" onSubmit={createProfile}>
              <strong className="operations-form-title">{profileEditingId ? "Edit patient profile" : "Add patient profile"}</strong>
              <label>
                Full name
                <input
                  maxLength={160}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                  required
                  value={profileForm.name}
                />
              </label>
              {!profileEditingId && (
                <label>
                  Relationship
                  <select
                    onChange={(event) => setProfileForm((current) => ({ ...current, relationship: event.target.value }))}
                    value={profileForm.relationship}
                  >
                    {["SELF", "FAMILY", "SPOUSE", "CHILD", "PARENT", "OTHER"].map((relationship) => (
                      <option key={relationship} value={relationship}>{statusLabel(relationship)}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Mobile number (optional)
                <input
                  autoComplete="tel"
                  onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))}
                  placeholder="+91 98765 43210"
                  type="tel"
                  value={profileForm.mobile}
                />
              </label>
              <button className="button admin-submit" disabled={busy === "profile"} type="submit">
                {busy === "profile" ? "Saving..." : profileEditingId ? "Save changes" : "Save profile"}
              </button>
            </form>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div className="admin-panel-icon"><Search size={16} /></div>
            <div>
              <h3>Find a doctor</h3>
              <p>One daily queue; active session capacities are combined.</p>
            </div>
          </div>
          <div className="operations-filter-grid">
            <label className="operations-field">
              Booking date
              <input
                max={availability.bookingThrough || undefined}
                min={hospitalDateToday()}
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>
            <label className="operations-field">
              Department
              <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="operations-field operations-search">
            Doctor or specialty
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search doctors or specialties"
              value={search}
            />
          </label>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div className="admin-panel-icon"><Activity size={16} /></div>
          <div>
            <h3>Available doctors</h3>
            <p>{selectedDate} · Book up to {availability.bookingThrough || "7 days"} ahead.</p>
          </div>
        </div>
        {availabilityError && <p className="form-message form-error" role="alert">{availabilityError}</p>}
        {availabilityLoading ? (
          <div className="admin-loading"><RefreshCw size={16} /> Checking availability...</div>
        ) : availability.doctors.length === 0 ? (
          <p className="admin-empty">No doctors match this search and date.</p>
        ) : (
          <>
            <div className="patient-doctor-grid">
              {pageRecords.map((doctor) => {
                const duplicate = alreadyBooked(doctor.id);
                return (
                  <article className="patient-doctor-card" key={doctor.id}>
                    <div className="patient-doctor-heading">
                      <div className="admin-doctor-avatar">
                        {doctor.photoUrl
                          ? <img alt="" src={doctor.photoUrl} />
                          : <UserRound size={18} />}
                      </div>
                      <div>
                        <strong>{doctor.name}</strong>
                        <span>{doctor.department.name}</span>
                      </div>
                    </div>
                    <p className="patient-doctor-specialty">
                      {doctor.specialization || doctor.qualification || "General consultation"}
                    </p>
                    <div className="patient-doctor-meta">
                      <span><strong>Fee</strong>{formatCurrency(doctor.consultationFee)}</span>
                      <span><strong>Tokens left</strong>{doctor.remaining} / {doctor.capacity}</span>
                      <span><strong>Doctor status</strong>{statusLabel(doctor.doctorStatus)}</span>
                      <span className="patient-availability-field">
                        <strong>Availability</strong>
                        <span className={doctor.available ? "patient-availability-open" : "patient-availability-closed"}>
                          {doctor.available ? "Available" : "Unavailable"}
                        </span>
                        {doctor.availabilityReason && (
                          <small>{availabilityReasonLabel(doctor.availabilityReason)}</small>
                        )}
                      </span>
                    </div>
                    <div className="patient-sessions">
                      {doctor.schedules.length === 0 && <span>No clinic sessions on this date.</span>}
                      {doctor.schedules.map((schedule) => (
                        <span key={schedule.id}>
                          <Clock3 size={12} /> {schedule.startTime}-{schedule.endTime} · {schedule.maxTokens} tokens
                        </span>
                      ))}
                    </div>
                    <button
                      className="button patient-book-button"
                      disabled={!doctor.available || duplicate || !selectedProfileId || Boolean(busy)}
                      onClick={() => createBooking(doctor.id)}
                      type="button"
                    >
                      {busy === doctor.id
                        ? "Booking..."
                        : duplicate
                          ? "Already booked"
                          : doctor.available
                            ? "Book a token"
                            : "Unavailable"}
                  </button>
                  </article>
                );
              })}
            </div>
            <Pagination
              onPageChange={setPage}
              page={page}
              pageCount={pageCount}
              recordLabel="doctor"
              totalRecords={availability.doctors.length}
            />
          </>
        )}
      </section>

      {tracking && (
        <section className="patient-tracking-card" aria-live="polite">
          <div className="patient-tracking-heading">
            <div>
              <span className="eyebrow"><Activity size={13} /> LIVE QUEUE</span>
              <h3>{tracking.booking.doctor.name}</h3>
              <p>{tracking.booking.patientProfile.name} · {tracking.booking.date}</p>
            </div>
            <span className={`operations-status operations-status-${tracking.booking.status.toLowerCase()}`}>
              {statusLabel(tracking.booking.status)}
            </span>
          </div>
          <div className="patient-tracking-stats">
            <div><span>Your token</span><strong>{tracking.booking.tokenNumber}</strong></div>
            <div><span>Now serving</span><strong>{tracking.queue.currentTokenNumber || "—"}</strong></div>
            <div><span>People ahead</span><strong>{tracking.queue.peopleAhead}</strong></div>
          </div>
          <p className="patient-tracking-note">
            Doctor status: <strong>{statusLabel(tracking.queue.doctorStatus)}</strong>.
            Queue refreshes automatically every 10 seconds.
          </p>
          {trackingError && <p className="form-message form-error" role="alert">{trackingError}</p>}
        </section>
      )}

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div className="admin-panel-icon"><CalendarDays size={16} /></div>
          <div>
            <h3>Your bookings</h3>
            <p>Track tokens and cancel bookings before they are called.</p>
          </div>
        </div>
        {bookings.length === 0 ? (
          <p className="admin-empty">Your bookings will appear here.</p>
        ) : (
          <div className="patient-booking-list">
            {bookings.map((booking) => (
              <article className="patient-booking-row" key={booking.id}>
                <div className="patient-booking-token">#{booking.tokenNumber}</div>
                <div className="patient-booking-copy">
                  <strong>{booking.doctor.name}</strong>
                  <span>{booking.patientProfile.name} · {booking.date} · {formatCurrency(booking.feeAtBooking)}</span>
                </div>
                <span className={`operations-status operations-status-${booking.status.toLowerCase()}`}>
                  {statusLabel(booking.status)}
                </span>
                <div className="patient-booking-actions">
                  <button
                    className="admin-row-action"
                    onClick={() => { setTrackingId(booking.id); setTracking(null); }}
                    type="button"
                  >
                    Track
                  </button>
                  {booking.status === "BOOKED" && (
                    <button
                      className="admin-row-action"
                      disabled={busy === booking.id}
                      onClick={() => cancelBooking(booking.id)}
                      type="button"
                    >
                      {busy === booking.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="operations-footnote"><ShieldCheck size={14} /> Your mobile number is optional contact information; no SMS is sent.</p>
    </section>
  );
}

export default PatientDashboard;
