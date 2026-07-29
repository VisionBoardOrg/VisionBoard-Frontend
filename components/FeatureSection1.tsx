import { Zap, Link as LinkIcon, Eye } from "lucide-react";

export default function FeatureSection1() {
  return (
    <section id="features" className="py-24 px-6 flex flex-col items-center text-center">
      <h2 className="text-[28px] max-w-[600px]   md:text-[36px] font-extrabold tracking-[-0.02em] mb-4">
        Bring clarity to how your team plans and executes.
      </h2>
      <p className="text-slate text-[16px] max-w-[600px] mb-16">
        Turn scattered goals, documentation, and workflows into one connected system powered by AI.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full text-left">
        {/* Card 1 */}
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <Zap className="text-blue mb-4" size={24} />
          <h3 className="font-bold text-[18px] mb-2">AI-Powered</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Smarter planning and roadmap generation for fast-moving teams.
          </p>
        </div>
        {/* Card 2 */}
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <LinkIcon className="text-blue mb-4" size={24} />
          <h3 className="font-bold text-[18px] mb-2">Connected</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Keep documentation, goals, and execution aligned in one workspace.
          </p>
        </div>
        {/* Card 3 */}
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <Eye className="text-blue mb-4" size={24} />
          <h3 className="font-bold text-[18px] mb-2">Visible</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Track progress, milestones, and execution in real time.
          </p>
        </div>
      </div>
    </section>
  );
}
