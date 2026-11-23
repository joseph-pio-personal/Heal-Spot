import { useEffect, useRef, useState } from "react";
import { Check, FilePlus2, Plus, Save, Trash2 } from "lucide-react";
import { apiRequest } from "../../api/client.js";

const blankItem = () => ({
  medicationName: "",
  strength: "",
  dosage: "",
  route: "",
  frequency: "",
  duration: "",
  quantity: "",
  instructions: "",
});

function DoctorPrescriptionEditor({ bookingId, onClose }) {
  const [booking, setBooking] = useState(null);
  const [versions, setVersions] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/doctor/prescriptions/bookings/${bookingId}`)
      .then((result) => {
        if (!active) return;
        setBooking(result.booking);
        setVersions(result.prescriptions);
        setDraft(result.prescriptions.find((item) => item.status === "DRAFT") ?? null);
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [bookingId]);

  const latest = versions[0];
  const updateDraft = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const createDraft = async (replacesPrescriptionId) => {
    setError("");
    setNotice("");
    setBusy("create");
    try {
      const { prescription } = await apiRequest(`/api/doctor/prescriptions/bookings/${bookingId}`, {
        method: "POST",
        body: JSON.stringify({ replacesPrescriptionId }),
      });
      setDraft(prescription);
      setVersions((current) => [prescription, ...current]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    if (!draft) return;
    setError("");
    setNotice("");
    setBusy("save");
    try {
      const { prescription } = await apiRequest(`/api/doctor/prescriptions/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({ notes: draft.notes ?? "", items: draft.items }),
      });
      setDraft(prescription);
      setVersions((current) => current.map((item) => item.id === prescription.id ? prescription : item));
      setNotice("Draft saved. It is not visible to the patient until finalized.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const finalizeDraft = async () => {
    if (!draft) return;
    if (!formRef.current?.reportValidity()) return;
    setError("");
    setNotice("");
    setBusy("finalize");
    try {
      const result = await apiRequest(`/api/doctor/prescriptions/${draft.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({ notes: draft.notes ?? "", items: draft.items }),
      });
      setDraft(null);
      setVersions((current) => current.map((item) => item.id === result.prescription.id
        ? result.prescription
        : item));
      setNotice(result.emailStatus === "QUEUED"
        ? "Prescription finalized. A secure access email is queued for the patient."
        : "Prescription finalized. No patient account email is available.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const updateItem = (index, field, value) => {
    updateDraft({
      items: draft.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    });
  };

  if (loading) return <div className="admin-loading">Loading prescription...</div>;

  return (
    <section className="doctor-prescription-editor" aria-label={`Prescription for ${booking?.patientName ?? "patient"}`}>
      <header className="doctor-prescription-heading">
        <div>
          <strong>Prescription · {booking?.patientName}</strong>
          {draft && <span>Draft version {draft.version} · only the doctor can view this draft</span>}
        </div>
        <button className="admin-row-action" onClick={onClose} type="button">Close</button>
      </header>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message form-success" role="status">{notice}</p>}

      {draft ? (
        <form className="doctor-prescription-form" onSubmit={saveDraft} ref={formRef}>
          <label>
            Visit notes / general instructions
            <textarea
              maxLength={2000}
              onChange={(event) => updateDraft({ notes: event.target.value })}
              rows={3}
              value={draft.notes ?? ""}
            />
          </label>
          <div className="doctor-prescription-items-heading">
            <strong>Medications ({draft.items.length})</strong>
            <button
              className="admin-secondary-button"
              disabled={draft.items.length >= 30}
              onClick={() => updateDraft({ items: [...draft.items, blankItem()] })}
              type="button"
            >
              <Plus size={14} /> Add medication
            </button>
          </div>
          {draft.items.length === 0 && (
            <p className="admin-empty">Add the medication details you intend to prescribe. Drafts are not shared with patients.</p>
          )}
          {draft.items.map((item, index) => (
            <fieldset className="doctor-prescription-item" key={`${draft.id}-${index}`}>
              <legend>Medication {index + 1}</legend>
              <div className="doctor-prescription-fields">
                <label>
                  Medication name *
                  <input
                    maxLength={200}
                    onChange={(event) => updateItem(index, "medicationName", event.target.value)}
                    required
                    value={item.medicationName}
                  />
                </label>
                <label>
                  Strength
                  <input
                    maxLength={100}
                    onChange={(event) => updateItem(index, "strength", event.target.value)}
                    value={item.strength ?? ""}
                  />
                </label>
                <label>
                  Dosage *
                  <input
                    maxLength={120}
                    onChange={(event) => updateItem(index, "dosage", event.target.value)}
                    placeholder="As directed"
                    required
                    value={item.dosage}
                  />
                </label>
                <label>
                  Route
                  <input
                    maxLength={80}
                    onChange={(event) => updateItem(index, "route", event.target.value)}
                    placeholder="e.g. oral"
                    value={item.route ?? ""}
                  />
                </label>
                <label>
                  Frequency *
                  <input
                    maxLength={120}
                    onChange={(event) => updateItem(index, "frequency", event.target.value)}
                    placeholder="As directed"
                    required
                    value={item.frequency}
                  />
                </label>
                <label>
                  Duration *
                  <input
                    maxLength={100}
                    onChange={(event) => updateItem(index, "duration", event.target.value)}
                    placeholder="As directed"
                    required
                    value={item.duration}
                  />
                </label>
                <label>
                  Quantity
                  <input
                    maxLength={100}
                    onChange={(event) => updateItem(index, "quantity", event.target.value)}
                    value={item.quantity ?? ""}
                  />
                </label>
                <label>
                  Additional instructions
                  <input
                    maxLength={500}
                    onChange={(event) => updateItem(index, "instructions", event.target.value)}
                    value={item.instructions ?? ""}
                  />
                </label>
              </div>
              <button
                aria-label={`Remove medication ${index + 1}`}
                className="admin-row-action doctor-prescription-remove"
                onClick={() => updateDraft({ items: draft.items.filter((_, itemIndex) => itemIndex !== index) })}
                type="button"
              >
                <Trash2 size={13} /> Remove
              </button>
            </fieldset>
          ))}
          <div className="doctor-prescription-actions">
            <button className="admin-secondary-button" disabled={busy !== ""} type="submit">
              <Save size={14} /> {busy === "save" ? "Saving..." : "Save draft"}
            </button>
            <button
              className="button staff-call-button"
              disabled={busy !== "" || draft.items.length === 0}
              onClick={finalizeDraft}
              type="button"
            >
              <Check size={14} /> {busy === "finalize" ? "Finalizing..." : "Finalize and share"}
            </button>
          </div>
          <p className="operations-footnote">
            Finalizing shares this prescription with the patient and locks this version. Use an amendment to make later changes.
          </p>
        </form>
      ) : latest ? (
        <div className="doctor-prescription-readonly">
          <p className="form-message form-success">
            Version {latest.version} is finalized{latest.issuedAt ? ` · ${new Date(latest.issuedAt).toLocaleString()}` : ""}.
            {latest.amendment && ` Superseded by version ${latest.amendment.version}.`}
          </p>
          {latest.notes && <p>{latest.notes}</p>}
          <ol className="doctor-prescription-readonly-items">
            {latest.items.map((item) => (
              <li key={item.id}>
                <strong>{item.medicationName}{item.strength ? ` · ${item.strength}` : ""}</strong>
                <span>{[item.dosage, item.route, item.frequency, item.duration, item.quantity].filter(Boolean).join(" · ")}</span>
                {item.instructions && <small>{item.instructions}</small>}
              </li>
            ))}
          </ol>
          <button
            className="admin-secondary-button"
            disabled={busy !== ""}
            onClick={() => createDraft(latest.id)}
            type="button"
          >
            <FilePlus2 size={14} /> {busy === "create" ? "Starting..." : "Create amendment"}
          </button>
        </div>
      ) : (
        <div className="doctor-prescription-empty">
          <p>No prescription has been entered for this visit.</p>
          <button className="admin-secondary-button" disabled={busy !== ""} onClick={() => createDraft(null)} type="button">
            <FilePlus2 size={14} /> {busy === "create" ? "Starting..." : "Start prescription"}
          </button>
        </div>
      )}

      {versions.length > 1 && (
        <details className="doctor-prescription-history">
          <summary>Prescription version history</summary>
          <ul>
            {versions.map((version) => (
              <li key={version.id}>
                Version {version.version} · {version.status.toLowerCase()}
                {version.issuedAt && ` · ${new Date(version.issuedAt).toLocaleDateString()}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default DoctorPrescriptionEditor;
