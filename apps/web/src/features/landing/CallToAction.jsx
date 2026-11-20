import { ChevronRight, HeartPulse } from "lucide-react";

function CallToAction() {
  return (
    <section className="cta-section page-width" id="get-started">
      <div className="cta-icon"><HeartPulse size={25} /></div>
      <div className="cta-copy">
        <span>YOUR NEXT VISIT, MADE EASIER</span>
        <h2>Ready to put your time first?</h2>
        <p>Heal Spot brings your hospital visit into one simple place.</p>
      </div>
      <a className="button button-white" href="#auth">Get started <ChevronRight size={17} /></a>
    </section>
  );
}

export default CallToAction;
