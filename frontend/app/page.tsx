import LandingHeader from '@/components/landing/Header';
import HeroSection from '@/components/landing/HeroSection';
import ToolsSection from '@/components/landing/ToolsSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background">
            <LandingHeader />
            <HeroSection />
            <ToolsSection />
            <FeaturesSection />
            <CTASection />
            <Footer />
        </div>
    );
}
