import { useState } from "react";
import { ArrowLeft, HeartPulse, ShieldCheck, UserRound } from "lucide-react";
import { apiRequest } from "../../api/client.js";
import AdminDashboard from "../admin/AdminDashboard.jsx";

const roleNames = {
  PATIENT: "Patient",
  ADMIN: "Administrator",
  RECEPTIONIST: "Receptionist",
  NURSE: "Nurse",
};

function Workspace({ user, onHome, onSignOut }) {
  const [error, setError] = useState("");

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

  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <a aria-label="Heal Spot home" className="brand" href="#" onClick={onHome}>
          <span className="brand-mark"><HeartPulse size={21} strokeWidth={2.5} /></span>
          <span>heal<span className="brand-accent">spot</span></span>
        </a>
        <button className="quiet-button" onClick={handleSignOut} type="button">Sign out</button>
      </div>
      <section className="workspace-card">
        <div className="workspace-icon"><UserRound size={23} /></div>
        <span className="eyebrow">{roleNames[user.role]} workspace</span>
        <h1>Welcome, {user.name}</h1>
        <p>
          {user.role === "PATIENT"
            ? "Your patient account is ready. Appointment booking and visit history are coming next."
            : isAdmin
              ? "Manage the people and services that make up your hospital."
              : "You are signed in with permissions for your hospital role."}
        </p>
        <div className="role-banner">
          <ShieldCheck size={18} />
          <span>Signed in as <strong>{roleNames[user.role]}</strong></span>
        </div>
      </section>
      {error && <p className="form-message form-error workspace-error" role="alert">{error}</p>}
      {isAdmin && <AdminDashboard currentUser={user} />}
      <button className="home-link" onClick={onHome} type="button"><ArrowLeft size={15} /> Back to Heal Spot</button>
    </main>
  );
}

export default Workspace;
