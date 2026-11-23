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

function LoginForm({ onAuthenticated, onHome, initialNotice = "" }) {
  const [role, setRole] = useState("PATIENT");
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    username: "",
    identifier: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [resending, setResending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const updateForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const switchRole = (nextRole) => {
    setRole(nextRole);
    if (nextRole !== "PATIENT") setMode("login");
    setError("");
    setNotice("");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setVerificationEmail("");
    setVerificationCode("");
  };

  const handlePatientSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const registering = mode === "register";
    if (mode === "register" && form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const payload = registering
        ? {
          name: form.name,
          email: form.email,
          username: form.username,
          mobile: form.mobile,
          password: form.password,
        }
        : { identifier: form.identifier, password: form.password };
      const result = await apiRequest(
        registering ? "/api/auth/patient/register" : "/api/auth/patient/login",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (registering) {
        setVerificationEmail(result.email);
        setVerificationCode("");
        setNotice(result.message);
        setMode("verify");
        setForm((current) => ({
          ...current,
          password: "",
          confirmPassword: "",
        }));
      } else {
        onAuthenticated(result.user);
      }
    } catch (requestError) {
      setError(requestError.message);
      if (!registering && requestError.message.includes("verify your email") && form.identifier.includes("@")) {
        setVerificationEmail(form.identifier);
        setMode("verify");
        setNotice("Enter the verification code sent to your email, or request a new one.");
        setError("");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerificationSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const { user } = await apiRequest("/api/auth/patient/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: verificationEmail, code: verificationCode }),
      });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setVerifying(false);
    }
  };

  const resendVerification = async () => {
    setError("");
    setNotice("");
    setResending(true);
    try {
      const result = await apiRequest("/api/auth/patient/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: verificationEmail || form.identifier }),
      });
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResending(false);
    }
  };

  const handleWorkforceSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const loginPath = role === "DOCTOR" ? "/api/auth/doctor/login" : "/api/auth/staff/login";
      const { user } = await apiRequest(loginPath, {
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
            aria-pressed={role === "DOCTOR"}
            className={role === "DOCTOR" ? "role-option role-option-active" : "role-option"}
            onClick={() => switchRole("DOCTOR")}
            type="button"
          >
            <Stethoscope size={16} /> Doctor
          </button>
          <button
            aria-pressed={role === "STAFF"}
            className={role === "STAFF" ? "role-option role-option-active" : "role-option"}
            onClick={() => switchRole("STAFF")}
            type="button"
          >
            <ShieldCheck size={16} /> Hospital staff
          </button>
        </div>

        {role === "PATIENT" ? (
          <>
            {mode !== "verify" && <div className="auth-mode">
              <button className={mode === "login" ? "auth-mode-active" : ""} onClick={() => switchMode("login")} type="button">
                Sign in
              </button>
              <button className={mode === "register" ? "auth-mode-active" : ""} onClick={() => switchMode("register")} type="button">
                Create account
              </button>
            </div>}
            {mode === "verify" ? (
              <form className="auth-form" onSubmit={handleVerificationSubmit}>
                <p className="staff-login-note">
                  Enter the 6-digit code sent to <strong>{verificationEmail}</strong>. The code expires in 10 minutes.
                </p>
                <label>
                  Email verification code
                  <input
                    autoComplete="one-time-code"
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    minLength={6}
                    name="verificationCode"
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    required
                    value={verificationCode}
                  />
                </label>
                {notice && <p className="form-message form-success" role="status">{notice}</p>}
                {error && <p className="form-message form-error" role="alert">{error}</p>}
                <button className="button auth-submit" disabled={verifying} type="submit">
                  {verifying ? "Verifying..." : "Verify and continue"}
                  {!verifying && <ArrowRight size={16} />}
                </button>
                <button className="admin-row-action" disabled={resending} onClick={resendVerification} type="button">
                  {resending ? "Sending..." : "Resend code"}
                </button>
                <button className="admin-row-action" onClick={() => switchMode("login")} type="button">
                  Back to sign in
                </button>
              </form>
            ) : <form className="auth-form" onSubmit={handlePatientSubmit}>
              {mode === "register" ? (
                <>
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
                  <label>
                    Email address
                    <input
                      autoComplete="email"
                      maxLength={254}
                      name="email"
                      onChange={updateForm}
                      placeholder="you@example.com"
                      required
                      type="email"
                      value={form.email}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      autoCapitalize="none"
                      autoComplete="username"
                      aria-describedby="patient-username-hint"
                      maxLength={32}
                      minLength={3}
                      name="username"
                      onChange={updateForm}
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"
                      placeholder="Choose a username"
                      required
                      spellCheck={false}
                      title="Use 3-32 letters, numbers, dots, underscores, or hyphens. No spaces."
                      value={form.username}
                    />
                    <span className="input-hint" id="patient-username-hint">
                      3-32 characters; no spaces. Use letters, numbers, dots, underscores, or hyphens.
                    </span>
                  </label>
                  <label>
                    Mobile number (optional)
                    <input
                      autoComplete="tel"
                      name="mobile"
                      onChange={updateForm}
                      placeholder="+91 98765 43210"
                      type="tel"
                      value={form.mobile}
                    />
                  </label>
                </>
              ) : (
                <label>
                  Email or username
                  <input
                    autoComplete="username"
                    name="identifier"
                    onChange={updateForm}
                    placeholder="Enter your email or username"
                    required
                    value={form.identifier}
                  />
                </label>
              )}
              <label>
                Password
                <input
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  maxLength={72}
                  minLength={12}
                  name="password"
                  onChange={updateForm}
                  placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"}
                  required
                  type="password"
                  value={form.password}
                />
              </label>
              {mode === "register" && (
                <label>
                  Confirm password
                  <input
                    autoComplete="new-password"
                    maxLength={72}
                    minLength={12}
                    name="confirmPassword"
                    onChange={updateForm}
                    placeholder="Re-enter your password"
                    required
                    type="password"
                    value={form.confirmPassword}
                  />
                </label>
              )}
              {notice && <p className="form-message form-success" role="status">{notice}</p>}
              {error && <p className="form-message form-error" role="alert">{error}</p>}
              {mode === "login" && role === "PATIENT" && error.includes("verify your email") && form.identifier.includes("@") && (
                <button className="admin-row-action" disabled={resending} onClick={resendVerification} type="button">
                  {resending ? "Sending..." : "Resend verification code"}
                </button>
              )}
              <button className="button auth-submit" disabled={busy} type="submit">
                {busy ? "Please wait..." : mode === "register" ? "Create patient account" : "Sign in"}
                {!busy && <ArrowRight size={16} />}
              </button>
            </form>}
            <div className="auth-footnote"><ShieldCheck size={15} /> Mobile is optional and never used to sign in.</div>
          </>
        ) : (
          <form className="auth-form staff-login-form" onSubmit={handleWorkforceSubmit}>
            <p className="staff-login-note">
              {role === "DOCTOR"
                ? "Doctor accounts are created by your Heal Spot administrator."
                : "Staff accounts are created by your Heal Spot administrator."}
            </p>
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
              {busy ? "Signing in..." : role === "DOCTOR" ? "Sign in as doctor" : "Sign in to staff panel"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>
        )}
      </section>

      <p className="auth-security"><ShieldCheck size={15} /> Private and secure sign-in</p>
    </main>
  );
}

export default LoginForm;
