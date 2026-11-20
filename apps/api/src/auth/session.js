const SESSION_COOKIE = "heal_spot_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function setSession(response, subject, role, sessionVersion) {
  const claims = { role };
  if (Number.isInteger(sessionVersion)) claims.sessionVersion = sessionVersion;
  const token = jwt.sign(claims, process.env.JWT_SECRET, {
    subject,
    audience: "heal-spot-app",
    issuer: "heal-spot-api",
    expiresIn: "8h",
  });

  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSession(response) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function publicPatient(account) {
  return {
    id: account.id,
    role: "PATIENT",
    name: account.profiles[0]?.name ?? "Patient",
    mobile: account.mobile,
  };
}

export function publicStaff(staff) {
  return {
    id: staff.id,
    role: staff.role,
    name: staff.name,
    email: staff.email,
  };
}
