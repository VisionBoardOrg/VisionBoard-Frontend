import Header from "@/components/Header";
import HomeHero from "@/components/HomeHero";
import FeatureSection1 from "@/components/FeatureSection1";
import FeatureSection2 from "@/components/FeatureSection2";
import FeatureSection3 from "@/components/FeatureSection3";
import BottomCTA from "@/components/BottomCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-offwhite font-sans text-ink">
      <Header />
      <HomeHero />
      <FeatureSection1 />
      <FeatureSection2 />
      <FeatureSection3 />
      <BottomCTA />
      <Footer />
    </div>
  );
}
