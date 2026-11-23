import { useEffect, useState } from "react";
import { apiBaseUrl, apiRequest } from "../../api/client.js";
import LoginForm from "../auth/LoginForm.jsx";

function PatientDocumentAccess({ documentId }) {
  const [user, setUser] = useState(undefined);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/me")
      .then(({ user: currentUser }) => active && setUser(currentUser))
      .catch(() => active && setUser(false))
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || user.role !== "PATIENT") return undefined;
    let active = true;
    let objectUrl = "";
    const loadDocument = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/patient/documents/${documentId}`, {
          credentials: "include",
        });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error ?? "Unable to load the prescription.");
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setDownloadUrl(objectUrl);
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    loadDocument();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, user]);

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

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <span className="eyebrow">PRIVATE MEDICAL DOCUMENT</span>
          <h1>Your prescription</h1>
          {user.role !== "PATIENT" && <p className="form-message form-error" role="alert">Sign in with the patient account that owns this booking.</p>}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {downloadUrl && user.role === "PATIENT" && (
            <p role="status">Your prescription is ready to download.</p>
          )}
        </div>
        {downloadUrl && user.role === "PATIENT" && (
          <a className="button auth-submit" download href={downloadUrl}>Download prescription</a>
        )}
        <a className="home-link" href="#auth">Continue to Heal Spot</a>
      </section>
    </main>
  );
}

export default PatientDocumentAccess;
