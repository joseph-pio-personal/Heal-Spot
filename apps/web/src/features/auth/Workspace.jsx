import { useState } from "react";
import { ArrowLeft, HeartPulse, ShieldCheck, UserRound } from "lucide-react";
import { apiRequest } from "../../api/client.js";
import AdminDashboard from "../admin/AdminDashboard.jsx";
import PatientDashboard from "../patient/PatientDashboard.jsx";
import StaffQueueDashboard from "../staff/StaffQueueDashboard.jsx";
import DoctorDashboard from "../doctor/DoctorDashboard.jsx";
import ProfilePage from "./ProfilePage.jsx";

const roleNames = {
  PATIENT: "Patient",
  ADMIN: "Administrator",
  RECEPTIONIST: "Receptionist",
  NURSE: "Nurse",
  DOCTOR: "Doctor",
};

function Workspace({ user, onHome, onSignOut }) {
  const [error, setError] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  if (showProfile) {
    return <ProfilePage onBack={() => setShowProfile(false)} />;
  }

  const handleSignOut = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setError("");
      onSignOut();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const isAdmin = user.role === "ADMIN";
  const isPatient = user.role === "PATIENT";
  const isDoctor = user.role === "DOCTOR";
  const isHospitalStaff = ["ADMIN", "RECEPTIONIST", "NURSE"].includes(user.role);

  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <a aria-label="Heal Spot home" className="brand" href="#" onClick={onHome}>
          <span className="brand-mark"><HeartPulse size={21} strokeWidth={2.5} /></span>
          <span>heal<span className="brand-accent">spot</span></span>
        </a>
        <div className="workspace-top-actions">
          <button className="quiet-button" onClick={() => setShowProfile(true)} type="button">
            <UserRound size={15} /> My profile
          </button>
          <button className="quiet-button" onClick={handleSignOut} type="button">Sign out</button>
        </div>
      </div>
      <section className="workspace-card">
        <div className="workspace-icon"><UserRound size={23} /></div>
        <span className="eyebrow">{roleNames[user.role]} workspace</span>
        <h1>Welcome, {user.name}</h1>
        <p>
          {isPatient
            ? "Manage patient profiles, book doctor tokens, and track your place in the queue."
            : isAdmin
              ? "Manage hospital services and keep today’s doctor queues moving."
              : user.role === "DOCTOR"
                ? "Review your clinic queue and prepare prescriptions for your visits."
                : "Manage today’s doctor queues and keep patients informed."}
        </p>
        <div className="role-banner">
          <ShieldCheck size={18} />
          <span>Signed in as <strong>{roleNames[user.role]}</strong></span>
        </div>
      </section>
      {error && <p className="form-message form-error workspace-error" role="alert">{error}</p>}
      {isPatient && <PatientDashboard />}
      {isAdmin && <AdminDashboard currentUser={user} />}
      {isHospitalStaff && <StaffQueueDashboard />}
      {isDoctor && <DoctorDashboard />}
      <button className="home-link" onClick={onHome} type="button"><ArrowLeft size={15} /> Back to Heal Spot</button>
    </main>
  );
}

export default Workspace;
