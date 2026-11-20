import { useState } from "react";
import { ArrowRight, HeartPulse, Menu, X } from "lucide-react";

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="topbar">
      <a aria-label="Heal Spot home" className="brand" href="#">
        <span className="brand-mark"><HeartPulse size={22} strokeWidth={2.5} /></span>
        <span>heal<span className="brand-accent">spot</span></span>
      </a>
      <button
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        className="menu-toggle"
        onClick={() => setMenuOpen(!menuOpen)}
        type="button"
      >
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      <nav className={menuOpen ? "navigation navigation-open" : "navigation"}>
        <a href="#how-it-works" onClick={closeMenu}>How it works</a>
        <a href="#why-healspot" onClick={closeMenu}>Why Heal Spot</a>
        <a className="nav-login" href="#auth" onClick={closeMenu}>Sign in</a>
        <a className="button button-small" href="#auth" onClick={closeMenu}>
          Get started <ArrowRight size={15} />
        </a>
      </nav>
    </header>
  );
}

export default SiteHeader;
