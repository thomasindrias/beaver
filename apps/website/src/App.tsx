import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { WaveDivider } from "./components/WaveDivider";
import { PainSection } from "./components/PainSection";
import { HowSection } from "./components/HowSection";
import { ArgumentSection } from "./components/ArgumentSection";
import { PrivacySection } from "./components/PrivacySection";
import { UsesSection } from "./components/UsesSection";
import { SourcesSection } from "./components/SourcesSection";
import { FinalCta } from "./components/FinalCta";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <main>
      <Nav />
      <Hero />
      <WaveDivider behind="cream" wave="river" />
      <PainSection />
      <WaveDivider behind="cream" wave="river" flip />
      <HowSection />
      <ArgumentSection />
      <SourcesSection />
      <WaveDivider behind="cream-deep" wave="bark" />
      <PrivacySection />
      <WaveDivider behind="cream" wave="bark" flip />
      <UsesSection />
      <FinalCta />
      <Footer />
    </main>
  );
}
