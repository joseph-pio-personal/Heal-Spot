import { useState } from "react";
import { CircleDollarSign, Clock3, Plus, Stethoscope, UsersRound } from "lucide-react";
import { apiRequest } from "../../api/client.js";
import Pagination, { usePagination } from "./Pagination.jsx";

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const INITIAL_SCHEDULE = { weekday: "MONDAY", startTime: "09:00", endTime: "13:00", maxTokens: 30, isActive: true };

function emptyDoctor(departmentId = "") {
  return {
    departmentId,
    name: "",
    email: "",
    password: "",
    hasLogin: false,
    photoUrl: "",
    qualification: "",
    specialization: "",
    experienceYears: "",
    consultationFee: "",
    status: "ACTIVE",
    schedules: [{ ...INITIAL_SCHEDULE }],
  };
}

function DoctorsPanel({ departments, doctors, busy, runAction }) {
  const activeDepartments = departments.filter((department) => department.status === "ACTIVE");
  const [form, setForm] = useState(() => emptyDoctor(activeDepartments[0]?.id ?? ""));
  const [editingId, setEditingId] = useState(null);
  const { page, pageCount, pageRecords, setPage } = usePagination(doctors);

  const updateSchedule = (scheduleIndex, changes) => {
    setForm((current) => ({
      ...current,
      schedules: current.schedules.map((schedule, index) => (
        index === scheduleIndex ? { ...schedule, ...changes } : schedule
      )),
    }));
  };

  const submitDoctor = (event) => {
    event.preventDefault();
    const path = editingId ? `/api/admin/doctors/${editingId}` : "/api/admin/doctors";
    runAction(
      () => apiRequest(path, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          ...(editingId && !form.password ? { password: undefined } : {}),
          experienceYears: form.experienceYears === "" ? null : Number(form.experienceYears),
          consultationFee: String(form.consultationFee),
          schedules: form.schedules.map((schedule) => ({
            ...schedule,
            maxTokens: Number(schedule.maxTokens),
          })),
        }),
      }),
      editingId ? "Doctor profile updated." : "Doctor added to the directory.",
    ).then((succeeded) => {
      if (succeeded) {
        setForm(emptyDoctor(activeDepartments[0]?.id ?? ""));
        setEditingId(null);
      }
    });
  };

  const editDoctor = (doctor) => {
    setEditingId(doctor.id);
    setForm({
      departmentId: doctor.departmentId,
      name: doctor.name,
      email: doctor.email ?? "",
      password: "",
      hasLogin: doctor.hasLogin,
      photoUrl: doctor.photoUrl ?? "",
      qualification: doctor.qualification ?? "",
      specialization: doctor.specialization ?? "",
      experienceYears: doctor.experienceYears ?? "",
      consultationFee: doctor.consultationFee,
      status: doctor.status,
      schedules: doctor.schedules.map(({ weekday, startTime, endTime, maxTokens, isActive }) => ({
        weekday,
        startTime,
        endTime,
        maxTokens,
        isActive,
      })),
    });
  };

  const cancelEdit = () => {
    setForm(emptyDoctor(activeDepartments[0]?.id ?? ""));
    setEditingId(null);
  };

  const changeStatus = (doctor) => runAction(
    () => apiRequest(`/api/admin/doctors/${doctor.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: doctor.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    }),
    "Doctor status updated.",
  );

  return (
    <div className="admin-doctors-layout">
      <form className="admin-panel admin-form admin-doctor-form" onSubmit={submitDoctor}>
        <div className="admin-panel-heading">
          <span className="admin-panel-icon"><Stethoscope size={17} /></span>
          <div>
            <h3>{editingId ? "Edit doctor profile" : "Add a doctor"}</h3>
            <p>Set doctor sign-in details, consultation fees, and clinic sessions.</p>
          </div>
        </div>
        <div className="admin-two-fields">
          <label>
            Doctor name
            <input maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
          </label>
          <label>
            Work email
            <input autoComplete="email" maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} />
          </label>
          <label>
            {editingId && form.hasLogin ? "Set a new password" : "Temporary password"}
            <input
              autoComplete="new-password"
              maxLength={72}
              minLength={12}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={editingId && form.hasLogin ? "Leave blank to keep current password" : "At least 12 characters"}
              required={!editingId || !form.hasLogin}
              type="password"
              value={form.password}
            />
          </label>
          <label>
            Department
            <select onChange={(event) => setForm({ ...form, departmentId: event.target.value })} required value={form.departmentId}>
              <option value="">Select department</option>
              {activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label>
            Consultation fee (₹)
            <input min="0" onChange={(event) => setForm({ ...form, consultationFee: event.target.value })} required step="0.01" type="number" value={form.consultationFee} />
          </label>
          <label>
            Experience (years)
            <input max="80" min="0" onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} type="number" value={form.experienceYears} />
          </label>
          <label>
            Qualification
            <input maxLength={200} onChange={(event) => setForm({ ...form, qualification: event.target.value })} value={form.qualification} />
          </label>
          <label>
            Specialization
            <input maxLength={200} onChange={(event) => setForm({ ...form, specialization: event.target.value })} value={form.specialization} />
          </label>
        </div>
        <label>
          Photo URL <span className="optional-label">Optional</span>
          <input maxLength={1000} onChange={(event) => setForm({ ...form, photoUrl: event.target.value })} placeholder="https://" type="url" value={form.photoUrl} />
        </label>
        {editingId && (
          <label>
            Profile status
            <select onChange={(event) => setForm({ ...form, status: event.target.value })} value={form.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        )}

        <div className="schedule-editor">
          <div className="schedule-editor-heading">
            <div><strong>Weekly schedule</strong><span>Sessions on the same day cannot overlap.</span></div>
            <button
              aria-label="Add schedule session"
              className="admin-icon-button"
              disabled={form.schedules.length >= 28}
              onClick={() => setForm({ ...form, schedules: [...form.schedules, { ...INITIAL_SCHEDULE }] })}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          {form.schedules.map((schedule, index) => (
            <div className="schedule-row" key={`${schedule.weekday}-${index}`}>
              <select aria-label={`Schedule ${index + 1} weekday`} onChange={(event) => updateSchedule(index, { weekday: event.target.value })} value={schedule.weekday}>
                {WEEKDAYS.map((day) => <option key={day} value={day}>{day.charAt(0) + day.slice(1).toLowerCase()}</option>)}
              </select>
              <input aria-label={`Schedule ${index + 1} start time`} onChange={(event) => updateSchedule(index, { startTime: event.target.value })} required type="time" value={schedule.startTime} />
              <input aria-label={`Schedule ${index + 1} end time`} onChange={(event) => updateSchedule(index, { endTime: event.target.value })} required type="time" value={schedule.endTime} />
              <input aria-label={`Schedule ${index + 1} token capacity`} min="1" onChange={(event) => updateSchedule(index, { maxTokens: event.target.value })} required type="number" value={schedule.maxTokens} />
              <select aria-label={`Schedule ${index + 1} status`} onChange={(event) => updateSchedule(index, { isActive: event.target.value === "active" })} value={schedule.isActive ? "active" : "inactive"}>
                <option value="active">On</option>
                <option value="inactive">Off</option>
              </select>
              {form.schedules.length > 1 && (
                <button
                  aria-label={`Remove schedule ${index + 1}`}
                  className="admin-remove-session"
                  onClick={() => setForm({ ...form, schedules: form.schedules.filter((_, entryIndex) => entryIndex !== index) })}
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="admin-form-actions">
          {editingId && <button className="admin-secondary-button" onClick={cancelEdit} type="button">Cancel</button>}
          <button className="button admin-submit" disabled={busy || activeDepartments.length === 0} type="submit">
            {editingId ? "Save profile" : <><Plus size={15} /> Add doctor</>}
          </button>
        </div>
        {activeDepartments.length === 0 && <p className="admin-inline-note">Add and activate a department before adding doctors.</p>}
      </form>

      <div className="admin-panel admin-list-panel">
        <div className="admin-panel-heading">
          <span className="admin-panel-icon"><UsersRound size={17} /></span>
          <div>
            <h3>Doctor directory <span className="admin-count">{doctors.length}</span></h3>
            <p>Fees and schedules are visible to patients.</p>
          </div>
        </div>
        {doctors.length === 0 ? (
          <p className="admin-empty">No doctors in the directory yet.</p>
        ) : (
          <div className="admin-doctor-list">
            {pageRecords.map((doctor) => (
              <article className="admin-doctor-row" key={doctor.id}>
                <div className="admin-doctor-avatar">
                  {doctor.photoUrl ? <img alt="" src={doctor.photoUrl} /> : <Stethoscope size={18} />}
                </div>
                <div className="admin-doctor-info">
                  <div className="admin-doctor-title">
                    <strong>{doctor.name}</strong>
                    <span className={doctor.status === "ACTIVE" ? "admin-status admin-status-active" : "admin-status"}>
                      {doctor.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <span>{doctor.email || "Doctor sign-in not configured"}</span>
                  <span>{doctor.department.name} · {doctor.specialization || doctor.qualification || "Doctor"}</span>
                  <div className="admin-doctor-meta">
                    <span><CircleDollarSign size={13} /> ₹{doctor.consultationFee}</span>
                    <span>
                      <Clock3 size={13} />
                      {doctor.schedules.filter((session) => session.isActive)
                        .map((session) => `${session.weekday.slice(0, 3)} ${session.startTime}-${session.endTime}`)
                        .join(" · ") || "No active sessions"}
                    </span>
                  </div>
                </div>
                <div className="admin-doctor-actions">
                  <button className="admin-row-action" onClick={() => editDoctor(doctor)} type="button">Edit</button>
                  <button className="admin-row-action" disabled={busy} onClick={() => changeStatus(doctor)} type="button">
                    {doctor.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <Pagination
          onPageChange={setPage}
          page={page}
          pageCount={pageCount}
          recordLabel="doctor"
          totalRecords={doctors.length}
        />
      </div>
    </div>
  );
}

export default DoctorsPanel;
