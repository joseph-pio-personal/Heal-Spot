import { CalendarDays, Clock3, UsersRound } from "lucide-react";

const benefits = [
  { icon: CalendarDays, title: "Book ahead", description: "Choose your doctor and visit day" },
  { icon: Clock3, title: "Know your place", description: "Follow queue progress on your phone" },
  { icon: UsersRound, title: "Bring family along", description: "Manage visits for your loved ones" },
];

function BenefitsSection() {
  return (
    <section className="benefit-strip page-width" id="why-healspot">
      {benefits.map(({ icon: Icon, title, description }) => (
        <div className="benefit" key={title}>
          <span className="benefit-icon"><Icon size={19} /></span>
          <div><strong>{title}</strong><span>{description}</span></div>
        </div>
      ))}
    </section>
  );
}

export default BenefitsSection;
