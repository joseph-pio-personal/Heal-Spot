import { useEffect, useState } from "react";
import { ArrowLeft, HeartPulse, Printer, ShieldCheck } from "lucide-react";
import { apiRequest } from "../../api/client.js";
import LoginForm from "../auth/LoginForm.jsx";

function PatientPrescriptionAccess({ prescriptionId }) {
  const [user, setUser] = useState(undefined);
  const [prescription, setPrescription] = useState(null);
  const [error, setError] = useState("");
  const [switchingAccount, setSwitchingAccount] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/me")
      .then(({ user: currentUser }) => active && setUser(currentUser))
      .catch(() => active && setUser(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || user.role !== "PATIENT") return undefined;
    let active = true;
    apiRequest(`/api/patient/prescriptions/${prescriptionId}`)
      .then(({ prescription: result }) => active && setPrescription(result))
      .catch((requestError) => active && setError(requestError.message));
    return () => { active = false; };
  }, [prescriptionId, user]);

  const switchToPatientAccount = async () => {
    setError("");
    setSwitchingAccount(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setUser(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSwitchingAccount(false);
    }
  };

  if (user === undefined) {
    return <main className="auth-page auth-session-check"><p role="status">Checking your sign-in...</p></main>;
  }
  if (!user) {
    return (
      <LoginForm
        initialNotice="Sign in to your patient account to securely access this prescription."
        onAuthenticated={setUser}
        onHome={() => { window.location.hash = ""; }}
      />
    );
  }
  if (user.role !== "PATIENT") {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="form-message form-error" role="alert">Sign in with the patient account that owns this prescription.</p>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          <button className="button auth-submit" disabled={switchingAccount} onClick={switchToPatientAccount} type="button">
            {switchingAccount ? "Signing out..." : "Sign out and use patient account"}
          </button>
          <a className="home-link" href="#auth">Continue to Heal Spot</a>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page patient-prescription-page">
      <div className="auth-topbar">
        <a aria-label="Heal Spot home" className="brand" href="#auth">
          <span className="brand-mark"><HeartPulse size={21} strokeWidth={2.5} /></span>
          <span>heal<span className="brand-accent">spot</span></span>
        </a>
        <a className="quiet-button" href="#auth"><ArrowLeft size={15} /> My dashboard</a>
      </div>
      <article className="patient-prescription-document" aria-label="Prescription">
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {!prescription && !error ? (
          <p role="status">Loading your prescription...</p>
        ) : prescription ? (
          <>
            <header className="patient-prescription-document-header">
              <div>
                <span className="eyebrow"><ShieldCheck size={13} /> PRIVATE MEDICAL RECORD</span>
                <h1>Prescription</h1>
                <p>Version {prescription.version}{prescription.issuedAt ? ` · Issued ${new Date(prescription.issuedAt).toLocaleString()}` : ""}</p>
              </div>
              <button className="admin-secondary-button prescription-print-button" onClick={() => window.print()} type="button">
                <Printer size={14} /> Print
              </button>
            </header>
            <dl className="patient-prescription-details">
              <div><dt>Patient</dt><dd>{prescription.visit.booking.patientProfile.name}</dd></div>
              <div><dt>Doctor</dt><dd>{prescription.doctor.name}</dd></div>
              <div><dt>Department</dt><dd>{prescription.doctor.department.name}</dd></div>
              <div><dt>Visit date</dt><dd>{prescription.visit.booking.date}</dd></div>
              <div><dt>Token</dt><dd>#{prescription.visit.booking.tokenNumber}</dd></div>
            </dl>
            <ol className="patient-prescription-medications">
              {prescription.items.map((item) => (
                <li key={item.id}>
                  <div className="patient-prescription-medication-heading">
                    <span>{item.position}</span>
                    <strong>{item.medicationName}{item.strength ? ` · ${item.strength}` : ""}</strong>
                  </div>
                  <dl>
                    <div><dt>Dosage</dt><dd>{item.dosage}</dd></div>
                    {item.route && <div><dt>Route</dt><dd>{item.route}</dd></div>}
                    <div><dt>Frequency</dt><dd>{item.frequency}</dd></div>
                    <div><dt>Duration</dt><dd>{item.duration}</dd></div>
                    {item.quantity && <div><dt>Quantity</dt><dd>{item.quantity}</dd></div>}
                    {item.instructions && <div className="prescription-instructions"><dt>Instructions</dt><dd>{item.instructions}</dd></div>}
                  </dl>
                </li>
              ))}
            </ol>
            {prescription.notes && (
              <section className="patient-prescription-notes">
                <h2>Doctor&apos;s notes</h2>
                <p>{prescription.notes}</p>
              </section>
            )}
            {prescription.replacesPrescription && (
              <p className="form-message">This is an amended prescription. It replaces version {prescription.replacesPrescription.version}.</p>
            )}
            {prescription.amendment && (
              <p className="form-message">A later prescription version ({prescription.amendment.version}) is available in your dashboard.</p>
            )}
            <p className="operations-footnote"><ShieldCheck size={14} /> This prescription is private. Keep it secure and consult your doctor if you have questions.</p>
          </>
        ) : null}
      </article>
    </main>
  );
}

export default PatientPrescriptionAccess;
