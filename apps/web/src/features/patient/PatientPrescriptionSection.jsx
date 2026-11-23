import { useEffect, useState } from "react";
import { ArrowUpRight, Pill, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest } from "../../api/client.js";

function PatientPrescriptionSection() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/api/patient/prescriptions")
      .then(({ prescriptions: results }) => active && setPrescriptions(results))
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <section className="admin-panel patient-prescriptions-panel" aria-label="My prescriptions">
      <div className="admin-panel-heading">
        <div className="admin-panel-icon"><Pill size={16} /></div>
        <div>
          <h3>My prescriptions</h3>
          <p>Finalized prescriptions from your visits are private to your patient account.</p>
        </div>
      </div>
      {loading ? (
        <div className="admin-loading"><RefreshCw size={16} /> Loading prescriptions...</div>
      ) : error ? (
        <p className="form-message form-error" role="alert">{error}</p>
      ) : prescriptions.length === 0 ? (
        <p className="admin-empty">Finalized prescriptions will appear here.</p>
      ) : (
        <div className="patient-prescription-list">
          {prescriptions.map((prescription) => {
            const booking = prescription.visit.booking;
            return (
              <article className="patient-prescription-row" key={prescription.id}>
                <span className="patient-prescription-icon"><Pill size={16} /></span>
                <div>
                  <strong>{prescription.doctor.name} · {booking.patientProfile.name}</strong>
                  <span>{booking.date} · Token #{booking.tokenNumber} · Version {prescription.version}</span>
                  {prescription.amendment && <small>Updated by a later prescription version.</small>}
                </div>
                <a className="admin-secondary-button" href={`#prescription/${prescription.id}`}>
                  View <ArrowUpRight size={13} />
                </a>
              </article>
            );
          })}
        </div>
      )}
      <p className="operations-footnote"><ShieldCheck size={14} /> Only finalized prescriptions are shown to patients.</p>
    </section>
  );
}

export default PatientPrescriptionSection;
