import Navbar from '../components/landing/Navbar.jsx';
import Hero from '../components/landing/Hero.jsx';
import HowItWorks from '../components/landing/HowItWorks.jsx';
import Preview from '../components/landing/Preview.jsx';
import Features from '../components/landing/Features.jsx';
import Pricing from '../components/landing/Pricing.jsx';
import WaitlistSection from '../components/landing/WaitlistSection.jsx';
import Footer from '../components/landing/Footer.jsx';

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Preview />
        <Features />
        <Pricing />
        <WaitlistSection />
      </main>
      <Footer />
    </div>
  );
}
