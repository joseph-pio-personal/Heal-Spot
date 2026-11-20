import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  HeartPulse,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { apiRequest } from "../../api/client.js";

function LoginForm({ onAuthenticated, onHome }) {
  const [role, setRole] = useState("PATIENT");
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("details");
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "", code: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const updateForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setStep("details");
    setError("");
    setNotice("");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setStep("details");
    setError("");
    setNotice("");
  };

  const handlePatientSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (step === "details") {
        const path = mode === "register" ? "/api/auth/patient/register" : "/api/auth/patient/login";
        const payload = { mobile: form.mobile };
        if (mode === "register") payload.name = form.name;
        const result = await apiRequest(path, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStep("verify");
        setNotice(result.smsBatchId
          ? `${result.message} Batch ID: ${result.smsBatchId}.`
          : result.message);
      } else {
        const { user } = await apiRequest("/api/auth/patient/verify", {
          method: "POST",
          body: JSON.stringify({
            mobile: form.mobile,
            code: form.code,
            mode,
            ...(mode === "register" ? { name: form.name } : {}),
          }),
        });
        onAuthenticated(user);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStaffSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user } = await apiRequest("/api/auth/staff/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <a aria-label="Heal Spot home" className="brand" href="#" onClick={onHome}>
          <span className="brand-mark"><HeartPulse size={21} strokeWidth={2.5} /></span>
          <span>heal<span className="brand-accent">spot</span></span>
        </a>
        <button className="quiet-button" onClick={onHome} type="button"><ArrowLeft size={15} /> Home</button>
      </div>

      <section className="auth-card">
        <div className="auth-heading">
          <div className="auth-heading-icon"><LockKeyhole size={21} /></div>
          <span className="eyebrow">WELCOME TO HEAL SPOT</span>
          <h1>Care starts here.</h1>
          <p>Sign in or create your account to continue.</p>
        </div>

        <div aria-label="Choose account type" className="role-switch" role="group">
          <button
            aria-pressed={role === "PATIENT"}
            className={role === "PATIENT" ? "role-option role-option-active" : "role-option"}
            onClick={() => switchRole("PATIENT")}
            type="button"
          >
            <UserRound size={16} /> Patient
          </button>
          <button
            aria-pressed={role === "STAFF"}
            className={role === "STAFF" ? "role-option role-option-active" : "role-option"}
            onClick={() => switchRole("STAFF")}
            type="button"
          >
            <Stethoscope size={16} /> Hospital staff
          </button>
        </div>

        {role === "PATIENT" ? (
          <>
            <div className="auth-mode">
              <button className={mode === "login" ? "auth-mode-active" : ""} onClick={() => switchMode("login")} type="button">
                Sign in
              </button>
              <button className={mode === "register" ? "auth-mode-active" : ""} onClick={() => switchMode("register")} type="button">
                Create account
              </button>
            </div>
            <form className="auth-form" onSubmit={handlePatientSubmit}>
              {mode === "register" && step === "details" && (
                <label>
                  Your name
                  <input
                    autoComplete="name"
                    maxLength={160}
                    name="name"
                    onChange={updateForm}
                    placeholder="Enter your full name"
                    required
                    value={form.name}
                  />
                </label>
              )}
              {(step === "details" || step === "verify") && (
                <label>
                  Mobile number
                  <input
                    autoComplete="tel"
                    name="mobile"
                    onChange={updateForm}
                    placeholder="+91 98765 43210"
                    readOnly={step === "verify"}
                    required
                    type="tel"
                    value={form.mobile}
                  />
                </label>
              )}
              {step === "verify" && (
                <label>
                  Six-digit verification code
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    name="code"
                    onChange={updateForm}
                    pattern="[0-9]{6}"
                    placeholder="Enter the code"
                    required
                    value={form.code}
                  />
                </label>
              )}
              {notice && <p className="form-message" role="status">{notice}</p>}
              {error && <p className="form-message form-error" role="alert">{error}</p>}
              <button className="button auth-submit" disabled={busy} type="submit">
                {busy
                  ? "Please wait..."
                  : step === "verify"
                    ? "Verify and continue"
                    : mode === "register"
                      ? "Create patient account"
                      : "Send sign-in code"}
                {!busy && <ArrowRight size={16} />}
              </button>
              {step === "verify" && (
                <button className="home-link change-number" onClick={() => { setStep("details"); setError(""); setNotice(""); }} type="button">
                  Use a different number
                </button>
              )}
            </form>
            <div className="auth-footnote"><ShieldCheck size={15} /> Your mobile number is used to secure your account.</div>
          </>
        ) : (
          <form className="auth-form staff-login-form" onSubmit={handleStaffSubmit}>
            <p className="staff-login-note">Staff accounts are created by your Heal Spot administrator.</p>
            <label>
              Work email
              <input
                autoComplete="username"
                name="email"
                onChange={updateForm}
                placeholder="you@hospital.com"
                required
                type="email"
                value={form.email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                name="password"
                onChange={updateForm}
                placeholder="Enter your password"
                required
                type="password"
                value={form.password}
              />
            </label>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
            <button className="button auth-submit" disabled={busy} type="submit">
              {busy ? "Signing in..." : "Sign in to staff panel"} {!busy && <ArrowRight size={16} />}
            </button>
          </form>
        )}
      </section>

      <p className="auth-security"><ShieldCheck size={15} /> Private and secure sign-in</p>
    </main>
  );
}

export default LoginForm;
