import { useEffect, useState } from "react";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./features/landing/LandingPage.jsx";

function App() {
  const [showAuth, setShowAuth] = useState(window.location.hash === "#auth");

  useEffect(() => {
    const syncAuthRoute = () => setShowAuth(window.location.hash === "#auth");
    window.addEventListener("hashchange", syncAuthRoute);
    return () => window.removeEventListener("hashchange", syncAuthRoute);
  }, []);

  return showAuth
    ? <AuthPage onHome={() => { window.location.hash = ""; }} />
    : <LandingPage />;
}

export default App;
