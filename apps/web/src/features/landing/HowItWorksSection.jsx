import { ArrowUpRight, CalendarDays, HeartPulse, Stethoscope } from "lucide-react";

const steps = [
  {
    title: "Find your doctor",
    description: "Explore departments and see which doctors are available.",
    icon: Stethoscope,
  },
  {
    title: "Book your token",
    description: "Choose a day that works for you and reserve your place in line.",
    icon: CalendarDays,
    featured: true,
  },
  {
    title: "Arrive at the right time",
    description: "Check queue progress and head in when your turn is getting close.",
    icon: HeartPulse,
  },
];

function HowItWorksSection() {
  return (
    <section className="steps-section" id="how-it-works">
      <div className="page-width">
        <div className="section-heading">
          <span className="eyebrow">SIMPLE FROM THE START</span>
          <h2>Care that fits your day.</h2>
          <p>Less time wondering. More time feeling looked after.</p>
        </div>
        <div className="steps-grid">
          {steps.map(({ title, description, icon: Icon, featured }, index) => (
            <article className={featured ? "step-card step-card-featured" : "step-card"} key={title}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="step-icon"><Icon size={21} /></div>
              <h3>{title}</h3>
              <p>{description}</p>
              <ArrowUpRight className="step-arrow" size={18} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
