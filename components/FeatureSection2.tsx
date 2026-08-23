import { Target, FileText, Users, Activity } from "lucide-react";

export default function FeatureSection2() {
  return (
    <section className="py-24 px-6 flex flex-col items-center text-center bg-offwhite">
      <h2 className="text-[28px] max-w-[600px] md:text-[36px] font-extrabold tracking-[-0.02em] mb-4">
        Everything teams need to move from vision to execution.
      </h2>
      <p className="text-slate text-[16px] max-w-[600px] mb-16">
        Discover how VisionBoard helps teams organize strategy, collaborate clearly, and execute faster with AI.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full text-left">
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <Target className="text-blue mb-4" size={24} aria-hidden="true" />
          <h3 className="font-bold text-[18px] mb-2">Generate strategic roadmaps with AI</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Turn goals into structured milestones, timelines, and execution flows in seconds.
          </p>
        </div>
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <FileText className="text-blue mb-4" size={24} aria-hidden="true" />
          <h3 className="font-bold text-[18px] mb-2">Keep documentation connected</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Organize notes, decisions, and workflows alongside your execution plans.
          </p>
        </div>
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <Users className="text-blue mb-4" size={24} aria-hidden="true" />
          <h3 className="font-bold text-[18px] mb-2">Collaborate with shared visibility</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Give every team a shared view of goals, milestones, and dependencies, so progress stays visible across planning and execution.
          </p>
        </div>
        <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <Activity className="text-blue mb-4" size={24} aria-hidden="true" />
          <h3 className="font-bold text-[18px] mb-2">Track execution in real time</h3>
          <p className="text-slate text-[14px] leading-[1.6]">
            Monitor milestones, blockers, and progress across every initiative from one intelligent dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}
