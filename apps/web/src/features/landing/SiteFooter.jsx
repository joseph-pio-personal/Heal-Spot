import { useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

function SiteFooter() {
  const [apiOnline, setApiOnline] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then(() => active && setApiOnline(true))
      .catch(() => active && setApiOnline(false));
    return () => { active = false; };
  }, []);

  return (
    <footer className="footer page-width">
      <a aria-label="Heal Spot home" className="brand footer-brand" href="#">
        <span className="brand-mark"><HeartPulse size={19} strokeWidth={2.5} /></span>
        <span>heal<span className="brand-accent">spot</span></span>
      </a>
      <span className="footer-note">Care that respects your time.</span>
      <span className="api-status">
        <span className={apiOnline ? "status-dot status-online" : "status-dot"} />
        API {apiOnline ? "connected" : "offline"}
      </span>
      <span className="footer-copy">© {new Date().getFullYear()} Heal Spot</span>
    </footer>
  );
}

export default SiteFooter;
