import { useEffect, useState } from "react";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./features/landing/LandingPage.jsx";
import PatientDocumentAccess from "./features/patient/PatientDocumentAccess.jsx";
import PatientPrescriptionAccess from "./features/patient/PatientPrescriptionAccess.jsx";

function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const syncRoute = () => setHash(window.location.hash);
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  const documentRoute = hash.match(/^#document\/([0-9a-f-]{36})$/i);
  if (documentRoute) return <PatientDocumentAccess documentId={documentRoute[1]} />;
  const prescriptionRoute = hash.match(/^#prescription\/([0-9a-f-]{36})$/i);
  if (prescriptionRoute) return <PatientPrescriptionAccess prescriptionId={prescriptionRoute[1]} />;
  return hash === "#auth"
    ? <AuthPage onHome={() => { window.location.hash = ""; }} />
    : <LandingPage />;
}

export default App;
