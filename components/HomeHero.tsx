import PrimaryButton from "./reusables/primaryButton";
import SecondaryButton from "./reusables/secondaryButton";
import { ArrowRight } from "lucide-react";

export default function HomeHero() {
    return (
        <section className="relative pt-10 flex flex-col items-center justify-start overflow-hidden bg-offwhite">
            {/* Subtle dot grid */}
            <div className="absolute inset-0 bg-[radial-gradient(#DBEAFE_1.5px,transparent_1.5px)] bg-size-[24px_24px] opacity-70" />
            
            <div className="relative z-10 flex flex-col items-center justify-center gap-6 max-w-4xl text-center px-6 mt-10">
                <h1 className="text-[52px] md:text-[64px] font-extrabold tracking-[-0.03em] text-ink leading-[1.1]">
                    Work <span className="text-blue">smarter</span> together with AI, from <span className="text-blue">vision</span> to <span className="text-blue-deep">execution</span>.
                </h1>

                <p className="text-[17px] md:text-[18px] text-slate leading-[1.65] max-w-[800px] font-medium">
                    Built for teams that need more than task management. VisionBoard combines AI-powered roadmaps, documentation, and a single workspace making tracking more transparent.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 mt-6">
                    <PrimaryButton size="md" className="w-full sm:w-auto px-8">
                        Button <ArrowRight size={18} className="ml-2" />
                    </PrimaryButton>
                    <SecondaryButton size="md" className="w-full sm:w-auto px-8 bg-white border border-blue-light text-blue shadow-sm">
                        Button <ArrowRight size={18} className="ml-2" />
                    </SecondaryButton>
                </div>
            </div>

            {/* Wavy Background Container */}
            <div className="relative w-full h-[300px] mt-4 flex flex-col justify-end">
                <svg className="absolute bottom-0 w-full h-[300px]" viewBox="0 0 1440 300" preserveAspectRatio="none">
                    <path d="M0,120 C480,380 960,380 1440,120 L1440,300 L0,300 Z" fill="var(--color-cyan)" />
                    <path d="M0,150 C480,410 960,410 1440,150 L1440,300 L0,300 Z" fill="var(--color-blue)" />
                    <path d="M0,200 C480,460 960,460 1440,200 L1440,300 L0,300 Z" fill="var(--color-blue-deep)" />
                </svg>
            </div>

            {/* Marquee Banner */}
            <div className="w-full bg-offwhite border-b border-border py-6 overflow-hidden flex whitespace-nowrap">
                <div className="animate-marquee flex gap-12 text-[20px] font-bold text-slate/40 tracking-tight italic px-6">
                    <span>Cross Team Planning</span>
                    <span>AI Powered Roadmap</span>
                    <span>Execution Visibility</span>
                    <span>AI Workflow Generations</span>
                    <span>Strategic Planning</span>
                    <span>Real-Time Collaboration</span>
                    <span>Smart Execution Tracking</span>
                    <span>Progress Intelligence</span>
                    <span>Cross Team Planning</span>
                    <span>AI Powered Roadmap</span>
                    <span>Execution Visibility</span>
                    <span>AI Workflow Generations</span>
                    <span>Strategic Planning</span>
                    <span>Real-Time Collaboration</span>
                    <span>Smart Execution Tracking</span>
                    <span>Progress Intelligence</span>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes marquee {
                    0% { transform: translateX(0%); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 20s linear infinite;
                }
            `}} />
        </section>
    );
}