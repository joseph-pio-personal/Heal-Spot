import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Camera,
  KeyRound,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { apiBaseUrl, apiRequest } from "../../api/client.js";

const roleNames = {
  PATIENT: "Patient",
  ADMIN: "Administrator",
  RECEPTIONIST: "Receptionist",
  NURSE: "Nurse",
  DOCTOR: "Doctor",
};

const passwordPaths = {
  PATIENT: "/api/auth/patient/change-password",
  DOCTOR: "/api/auth/doctor/change-password",
  ADMIN: "/api/auth/staff/change-password",
  RECEPTIONIST: "/api/auth/staff/change-password",
  NURSE: "/api/auth/staff/change-password",
};

function formattedDate(value) {
  if (!value) return "Not provided";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ProfilePhoto({ photoUrl, name }) {
  return (
    <div className="profile-photo">
      {photoUrl
        ? <img alt={`${name}'s profile`} src={photoUrl} />
        : <UserRound aria-hidden="true" size={28} />}
    </div>
  );
}

function PasswordForm({ role }) {
  const [fields, setFields] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (fields.newPassword !== fields.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest(passwordPaths[role], {
        method: "POST",
        body: JSON.stringify({
          currentPassword: fields.currentPassword,
          newPassword: fields.newPassword,
        }),
      });
      setFields({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-section">
      <div className="profile-section-heading">
        <span className="profile-section-icon"><KeyRound size={17} /></span>
        <div>
          <h2>Change password</h2>
          <p>Verify your current password to secure your account.</p>
        </div>
      </div>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message form-success" role="status">{notice}</p>}
      <form className="auth-form profile-password-form" onSubmit={handleSubmit}>
        <label>
          Current password
          <input
            autoComplete="current-password"
            onChange={(event) => setFields((current) => ({ ...current, currentPassword: event.target.value }))}
            required
            type="password"
            value={fields.currentPassword}
          />
        </label>
        <label>
          New password
          <input
            autoComplete="new-password"
            maxLength={72}
            minLength={12}
            onChange={(event) => setFields((current) => ({ ...current, newPassword: event.target.value }))}
            required
            type="password"
            value={fields.newPassword}
          />
        </label>
        <label>
          Confirm new password
          <input
            autoComplete="new-password"
            maxLength={72}
            minLength={12}
            onChange={(event) => setFields((current) => ({ ...current, confirmPassword: event.target.value }))}
            required
            type="password"
            value={fields.confirmPassword}
          />
        </label>
        <p className="profile-form-hint">Use a different password between 12 and 72 bytes. Other signed-in sessions will be revoked.</p>
        <button className="button auth-submit" disabled={busy} type="submit">
          {busy ? "Updating..." : "Update password"}
        </button>
      </form>
    </section>
  );
}

function ProfilePage({ onBack }) {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [photoBusy, setPhotoBusy] = useState("");
  const [photoVersion, setPhotoVersion] = useState(Date.now());

  useEffect(() => {
    let active = true;
    apiRequest("/api/profile")
      .then(({ profile: loadedProfile }) => active && setProfile(loadedProfile))
      .catch((requestError) => active && setLoadError(requestError.message));
    return () => { active = false; };
  }, []);

  const uploadPhoto = async (event, profileId = "") => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPhotoError("");
    setPhotoNotice("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Profile images must be 5 MB or smaller.");
      return;
    }

    const target = profileId || "account";
    setPhotoBusy(target);
    try {
      const path = profileId
        ? `/api/profile/photo/${encodeURIComponent(profileId)}`
        : "/api/profile/photo";
      const result = await apiRequest(path, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      setPhotoVersion(Date.now());
      setProfile((current) => current.role === "PATIENT"
        ? {
          ...current,
          profiles: current.profiles.map((patientProfile) => (
            patientProfile.id === profileId
              ? { ...patientProfile, photoUrl: result.photoUrl }
              : patientProfile
          )),
        }
        : { ...current, photoUrl: result.photoUrl });
      setPhotoNotice("Profile photo updated.");
    } catch (requestError) {
      setPhotoError(requestError.message);
    } finally {
      setPhotoBusy("");
    }
  };

  const photoSource = (photoUrl) => (
    photoUrl ? `${apiBaseUrl}${photoUrl}?v=${photoVersion}` : null
  );

  return (
    <main className="auth-page profile-page">
      <div className="auth-topbar">
        <a aria-label="Heal Spot home" className="brand" href="#" onClick={(event) => {
          event.preventDefault();
          onBack();
        }}>
          <span className="brand-mark"><ShieldCheck size={21} strokeWidth={2.5} /></span>
          <span>heal<span className="brand-accent">spot</span></span>
        </a>
        <button className="quiet-button" onClick={onBack} type="button"><ArrowLeft size={15} /> Back to workspace</button>
      </div>

      <div className="profile-page-content">
        <header className="profile-page-heading">
          <span className="eyebrow">ACCOUNT SETTINGS</span>
          <h1>My profile</h1>
          <p>Your account details, profile photo, and password security.</p>
        </header>
        {loadError && <p className="form-message form-error" role="alert">{loadError}</p>}
        {photoError && <p className="form-message form-error" role="alert">{photoError}</p>}
        {photoNotice && <p className="form-message form-success" role="status">{photoNotice}</p>}

        {profile ? (
          <>
            <section className="profile-section profile-details">
              <div className="profile-identity">
                <ProfilePhoto photoUrl={photoSource(profile.photoUrl)} name={profile.name} />
                <div>
                  <span className="eyebrow">{roleNames[profile.role]}</span>
                  <h2>{profile.name}</h2>
                  {profile.email && <p>{profile.email}</p>}
                </div>
                {profile.role !== "PATIENT" && (
                  <label className="profile-upload-button">
                    <Camera size={15} />
                    {photoBusy === "account" ? "Uploading..." : "Update photo"}
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Upload profile photo"
                      disabled={Boolean(photoBusy)}
                      onChange={uploadPhoto}
                      type="file"
                    />
                  </label>
                )}
              </div>

              {profile.role === "PATIENT" ? (
                <dl className="profile-details-grid">
                  <div><dt>Email</dt><dd>{profile.email || "Not provided"}</dd></div>
                  <div><dt>Username</dt><dd>{profile.username || "Not provided"}</dd></div>
                  <div><dt>Account mobile</dt><dd>{profile.mobile || "Not provided"}</dd></div>
                  <div><dt>Member since</dt><dd>{formattedDate(profile.createdAt)}</dd></div>
                  <div><dt>Account status</dt><dd>{profile.status}</dd></div>
                </dl>
              ) : profile.role === "DOCTOR" ? (
                <>
                  <dl className="profile-details-grid">
                    <div><dt>Work email</dt><dd>{profile.email || "Not provided"}</dd></div>
                    <div><dt>Department</dt><dd>{profile.department}</dd></div>
                    <div><dt>Specialization</dt><dd>{profile.specialization || "Not provided"}</dd></div>
                    <div><dt>Qualification</dt><dd>{profile.qualification || "Not provided"}</dd></div>
                    <div><dt>Experience</dt><dd>{profile.experienceYears === null ? "Not provided" : `${profile.experienceYears} years`}</dd></div>
                    <div><dt>Consultation fee</dt><dd>₹{profile.consultationFee}</dd></div>
                    <div><dt>Account status</dt><dd>{profile.status}</dd></div>
                    <div><dt>Member since</dt><dd>{formattedDate(profile.createdAt)}</dd></div>
                  </dl>
                  <div className="profile-schedule">
                    <h3><Stethoscope size={15} /> Clinic schedule</h3>
                    {profile.schedules.length
                      ? profile.schedules.map((schedule) => (
                        <div className="profile-schedule-row" key={schedule.id}>
                          <span>{schedule.weekday}</span>
                          <span>{schedule.startTime}–{schedule.endTime}</span>
                          <span>{schedule.isActive ? "Active" : "Inactive"} · {schedule.maxTokens} tokens</span>
                        </div>
                      ))
                      : <p>No clinic sessions are currently listed.</p>}
                  </div>
                </>
              ) : (
                <dl className="profile-details-grid">
                  <div><dt>Email</dt><dd>{profile.email}</dd></div>
                  <div><dt>Role</dt><dd>{roleNames[profile.role]}</dd></div>
                  <div><dt>Account status</dt><dd>{profile.status}</dd></div>
                  <div><dt>Member since</dt><dd>{formattedDate(profile.createdAt)}</dd></div>
                </dl>
              )}
            </section>

            {profile.role === "PATIENT" && (
              <section className="profile-section">
                <div className="profile-section-heading">
                  <span className="profile-section-icon"><UserRound size={17} /></span>
                  <div>
                    <h2>Patient and family profiles</h2>
                    <p>Each patient has an individual photo and profile.</p>
                  </div>
                </div>
                <div className="patient-profile-photo-list">
                  {profile.profiles.map((patientProfile) => (
                    <article className="patient-profile-photo-card" key={patientProfile.id}>
                      <ProfilePhoto
                        name={patientProfile.name}
                        photoUrl={photoSource(patientProfile.photoUrl)}
                      />
                      <div className="patient-profile-photo-details">
                        <strong>{patientProfile.name}</strong>
                        <span>{patientProfile.relationship || "Family member"}</span>
                        <span>{patientProfile.mobile || "No mobile number"}</span>
                        {patientProfile.dateOfBirth && <span>Born {formattedDate(patientProfile.dateOfBirth)}</span>}
                        {patientProfile.gender && <span>{patientProfile.gender.replaceAll("_", " ")}</span>}
                        {patientProfile.bloodGroup && <span>Blood group: {patientProfile.bloodGroup}</span>}
                        {patientProfile.address && <span>{patientProfile.address}</span>}
                      </div>
                      <label className="profile-upload-button">
                        <Camera size={15} />
                        {photoBusy === patientProfile.id ? "Uploading..." : "Upload photo"}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          aria-label={`Upload photo for ${patientProfile.name}`}
                          disabled={Boolean(photoBusy)}
                          onChange={(event) => uploadPhoto(event, patientProfile.id)}
                          type="file"
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <PasswordForm role={profile.role} />
          </>
        ) : !loadError ? (
          <p className="profile-loading" role="status">Loading your profile...</p>
        ) : null}
      </div>
    </main>
  );
}

export default ProfilePage;
