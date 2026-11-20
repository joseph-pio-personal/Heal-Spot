import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Heart,
  Sparkles,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

function HeroSection() {
  return (
    <section className="hero page-width">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> A better way to visit your doctor</div>
        <h1>Good care.<br />Less <span className="text-highlight">waiting.</span></h1>
        <p className="hero-description">
          Book your doctor&apos;s token ahead of time and follow your place in
          line from wherever you are. Your time matters.
        </p>
        <div className="hero-actions">
          <a className="button" href="#auth">Book an appointment <ArrowRight size={17} /></a>
          <a className="text-link" href="#how-it-works">See how it works <ArrowDownRight size={16} /></a>
        </div>
        <div className="trust-line">
          <span className="trust-icon"><ShieldCheck size={17} /></span>
          Your health information stays private
        </div>
      </div>

      <div className="hero-visual" aria-label="Illustration preview of a patient queue card">
        <div className="soft-orbit orbit-one" />
        <div className="soft-orbit orbit-two" />
        <div className="float-pill pill-top"><span className="live-dot" /> Queue updates live</div>
        <div className="queue-card">
          <div className="queue-card-top">
            <div>
              <span className="card-overline">YOUR VISIT</span>
              <h2>Today&apos;s queue</h2>
            </div>
            <span className="calendar-icon"><CalendarDays size={19} /></span>
          </div>
          <div className="doctor-row">
            <div className="doctor-avatar"><Stethoscope size={21} /></div>
            <div className="doctor-copy">
              <strong>Your doctor</strong>
              <span>General consultation</span>
            </div>
            <span className="status-chip"><span className="live-dot" /> In clinic</span>
          </div>
          <div className="token-panel">
            <div className="token-number"><span>Your token</span><strong>--</strong></div>
            <div className="token-divider" />
            <div className="token-ahead"><span>People ahead</span><strong>--</strong></div>
          </div>
          <div className="queue-progress">
            <div className="queue-progress-label"><span>Live queue</span><span>Updates automatically</span></div>
            <div className="progress-track"><span /></div>
          </div>
          <div className="queue-note"><Clock3 size={15} /> Your live queue appears after you book</div>
        </div>
        <div className="float-pill pill-bottom"><span className="check-icon"><Check size={14} /></span> No more waiting-room guesswork</div>
        <div className="visual-spark spark-one"><Sparkles size={18} /></div>
        <div className="visual-spark spark-two"><Heart size={16} /></div>
      </div>
    </section>
  );
}

export default HeroSection;
