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
      <WaveDivider />
      <PainSection />
      <WaveDivider flip />
      <HowSection />
      <ArgumentSection />
      <SourcesSection />
      <WaveDivider color="bark" />
      <PrivacySection />
      <WaveDivider color="bark" flip />
      <UsesSection />
      <FinalCta />
      <Footer />
    </main>
  );
}
