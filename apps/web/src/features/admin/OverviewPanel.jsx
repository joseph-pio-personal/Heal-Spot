import { Activity, ArrowRight, CalendarDays, Stethoscope, UsersRound } from "lucide-react";

function OverviewPanel({ departments, doctors, staff }) {
  const activeDepartments = departments.filter((department) => department.status === "ACTIVE");
  const activeDoctors = doctors.filter(
    (doctor) => doctor.status === "ACTIVE" && doctor.department.status === "ACTIVE",
  ).length;
  const activeStaff = staff.filter((member) => member.isActive).length;

  return (
    <div className="admin-overview">
      <article className="admin-stat-card">
        <span className="admin-stat-icon"><Stethoscope size={19} /></span>
        <span className="admin-stat-label">Active doctors</span>
        <strong>{activeDoctors}</strong>
        <span className="admin-stat-note">Across {activeDepartments.length} departments</span>
      </article>
      <article className="admin-stat-card">
        <span className="admin-stat-icon"><UsersRound size={19} /></span>
        <span className="admin-stat-label">Active staff</span>
        <strong>{activeStaff}</strong>
        <span className="admin-stat-note">Admins, receptionists and nurses</span>
      </article>
      <article className="admin-stat-card">
        <span className="admin-stat-icon"><Activity size={19} /></span>
        <span className="admin-stat-label">Departments</span>
        <strong>{activeDepartments.length}</strong>
        <span className="admin-stat-note">Available for patient discovery</span>
      </article>
      <div className="admin-overview-note">
        <div className="admin-overview-note-icon"><CalendarDays size={18} /></div>
        <div>
          <strong>Phase 1 foundation</strong>
          <p>Keep profiles, weekly clinic hours and fees up to date. Patients can browse active doctors and departments.</p>
        </div>
        <ArrowRight size={17} />
      </div>
    </div>
  );
}

export default OverviewPanel;
