import BenefitsSection from "./BenefitsSection.jsx";
import CallToAction from "./CallToAction.jsx";
import HeroSection from "./HeroSection.jsx";
import HowItWorksSection from "./HowItWorksSection.jsx";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";

function LandingPage() {
  return (
    <main>
      <SiteHeader />
      <HeroSection />
      <BenefitsSection />
      <HowItWorksSection />
      <CallToAction />
      <SiteFooter />
    </main>
  );
}

export default LandingPage;
