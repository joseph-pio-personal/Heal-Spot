import { useEffect, useState } from "react";
import { apiRequest } from "./api/client.js";
import LoginForm from "./features/auth/LoginForm.jsx";
import Workspace from "./features/auth/Workspace.jsx";

function AuthPage({ onHome }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/me")
      .then(({ user: currentUser }) => active && setUser(currentUser))
      .catch(() => {})
      .finally(() => active && setCheckingSession(false));
    return () => { active = false; };
  }, []);

  if (checkingSession) {
    return (
      <main className="auth-page auth-session-check">
        <p role="status">Checking your session...</p>
      </main>
    );
  }

  return user
    ? <Workspace user={user} onHome={onHome} onSignOut={() => setUser(null)} />
    : <LoginForm onAuthenticated={setUser} onHome={onHome} />;
}

export default AuthPage;
