import { useState } from "react";
import { Activity, Plus, Stethoscope } from "lucide-react";
import { apiRequest } from "../../api/client.js";

function DepartmentsPanel({ departments, busy, runAction }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [editingId, setEditingId] = useState(null);

  const submitDepartment = (event) => {
    event.preventDefault();
    const path = editingId ? `/api/admin/departments/${editingId}` : "/api/admin/departments";
    runAction(
      () => apiRequest(path, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(form),
      }),
      editingId ? "Department details updated." : "Department added.",
    ).then((succeeded) => {
      if (succeeded) {
        setForm({ name: "", description: "" });
        setEditingId(null);
      }
    });
  };

  const editDepartment = (department) => {
    setEditingId(department.id);
    setForm({ name: department.name, description: department.description ?? "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", description: "" });
  };

  const changeStatus = (department) => runAction(
    () => apiRequest(`/api/admin/departments/${department.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: department.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    }),
    "Department status updated.",
  );

  return (
    <div className="admin-section-grid">
      <form className="admin-panel admin-form" onSubmit={submitDepartment}>
        <div className="admin-panel-heading">
          <span className="admin-panel-icon"><Stethoscope size={17} /></span>
          <div>
            <h3>{editingId ? "Edit department" : "Add a department"}</h3>
            <p>Departments help patients find the right care.</p>
          </div>
        </div>
        <label>
          Department name
          <input
            maxLength={120}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            value={form.name}
          />
        </label>
        <label>
          Description <span className="optional-label">Optional</span>
          <textarea
            maxLength={500}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={3}
            value={form.description}
          />
        </label>
        <div className="admin-form-actions">
          {editingId && <button className="admin-secondary-button" onClick={cancelEdit} type="button">Cancel</button>}
          <button className="button admin-submit" disabled={busy} type="submit">
            {editingId ? "Save changes" : <><Plus size={15} /> Add department</>}
          </button>
        </div>
      </form>

      <div className="admin-panel admin-list-panel">
        <div className="admin-panel-heading">
          <span className="admin-panel-icon"><Activity size={17} /></span>
          <div>
            <h3>Departments <span className="admin-count">{departments.length}</span></h3>
            <p>Inactive departments stay in your records.</p>
          </div>
        </div>
        {departments.length === 0 ? (
          <p className="admin-empty">No departments yet. Add the first one to get started.</p>
        ) : (
          <div className="admin-entity-list">
            {departments.map((department) => (
              <article className="admin-entity-row" key={department.id}>
                <div className="admin-entity-symbol"><Stethoscope size={17} /></div>
                <div className="admin-entity-copy">
                  <strong>{department.name}</strong>
                  <span>{department._count?.doctors ?? 0} doctors · {department.description || "No description"}</span>
                </div>
                <span className={department.status === "ACTIVE" ? "admin-status admin-status-active" : "admin-status"}>
                  {department.status === "ACTIVE" ? "Active" : "Inactive"}
                </span>
                <button aria-label={`Edit ${department.name}`} className="admin-row-action" onClick={() => editDepartment(department)} type="button">Edit</button>
                <button className="admin-row-action" disabled={busy} onClick={() => changeStatus(department)} type="button">
                  {department.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DepartmentsPanel;
