import { useState } from "react";
import { Plus, ShieldCheck, UsersRound } from "lucide-react";
import { apiRequest } from "../../api/client.js";

const STAFF_ROLES = ["ADMIN", "RECEPTIONIST", "NURSE"];

function roleLabel(role) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function StaffPanel({ staff, currentUser, busy, runAction }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "RECEPTIONIST" });
  const [resetPasswords, setResetPasswords] = useState({});

  const createStaff = (event) => {
    event.preventDefault();
    runAction(
      () => apiRequest("/api/auth/admin/staff", {
        method: "POST",
        body: JSON.stringify(form),
      }),
      "Staff account created. Share the temporary password securely.",
    ).then((succeeded) => {
      if (succeeded) setForm({ name: "", email: "", password: "", role: "RECEPTIONIST" });
    });
  };

  const updateStaff = (member, changes) => runAction(
    () => apiRequest(`/api/auth/admin/staff/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
    "Staff account updated. Their active session has been revoked.",
  );

  const resetPassword = (event, member) => {
    event.preventDefault();
    runAction(
      () => apiRequest(`/api/auth/admin/staff/${member.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: resetPasswords[member.id] ?? "" }),
      }),
      "Password reset. The staff member must sign in again.",
    ).then((succeeded) => {
      if (succeeded) {
        setResetPasswords((current) => ({ ...current, [member.id]: "" }));
      }
    });
  };

  return (
    <div className="admin-section-grid admin-staff-grid">
      <form className="admin-panel admin-form" onSubmit={createStaff}>
        <div className="admin-panel-heading">
          <span className="admin-panel-icon"><UsersRound size={17} /></span>
          <div><h3>Create a staff account</h3><p>Staff sign in with their work email.</p></div>
        </div>
        <label>
          Full name
          <input autoComplete="name" maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
        </label>
        <label>
          Work email
          <input autoComplete="email" onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} />
        </label>
        <label>
          Temporary password
          <input autoComplete="new-password" minLength={12} onChange={(event) => setForm({ ...form, password: event.target.value })} required type="password" value={form.password} />
        </label>
        <label>
          Role
          <select onChange={(event) => setForm({ ...form, role: event.target.value })} value={form.role}>
            {STAFF_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
        </label>
        <button className="button admin-submit" disabled={busy} type="submit"><Plus size={15} /> Create staff account</button>
      </form>

      <div className="admin-panel admin-list-panel">
        <div className="admin-panel-heading">
          <span className="admin-panel-icon"><ShieldCheck size={17} /></span>
          <div>
            <h3>Staff accounts <span className="admin-count">{staff.length}</span></h3>
            <p>Role and password changes revoke existing sessions.</p>
          </div>
        </div>
        {staff.length === 0 ? (
          <p className="admin-empty">No staff accounts yet.</p>
        ) : (
          <div className="admin-staff-list">
            {staff.map((member) => (
              <article className="admin-staff-row" key={member.id}>
                <div className="admin-staff-avatar">
                  {member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="admin-staff-info">
                  <strong>
                    {member.name}
                    {member.id === currentUser.id && <span className="you-tag">YOU</span>}
                  </strong>
                  <span>{member.email}</span>
                </div>
                <select
                  aria-label={`Role for ${member.name}`}
                  disabled={busy || member.id === currentUser.id}
                  onChange={(event) => updateStaff(member, { role: event.target.value })}
                  value={member.role}
                >
                  {STAFF_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                </select>
                <button
                  className={member.isActive ? "admin-status-toggle admin-status-toggle-active" : "admin-status-toggle"}
                  disabled={busy || member.id === currentUser.id}
                  onClick={() => updateStaff(member, { isActive: !member.isActive })}
                  type="button"
                >
                  {member.isActive ? "Active" : "Inactive"}
                </button>
                {member.id !== currentUser.id && (
                  <form className="admin-password-reset" onSubmit={(event) => resetPassword(event, member)}>
                    <input
                      aria-label={`New password for ${member.name}`}
                      autoComplete="new-password"
                      minLength={12}
                      onChange={(event) => setResetPasswords((current) => ({ ...current, [member.id]: event.target.value }))}
                      placeholder="New password (12+ chars)"
                      required
                      type="password"
                      value={resetPasswords[member.id] ?? ""}
                    />
                    <button aria-label={`Reset password for ${member.name}`} disabled={busy} type="submit">Reset</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StaffPanel;
