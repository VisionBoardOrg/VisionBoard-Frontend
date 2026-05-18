export default function FeatureSection3() {
  return (
    <section className="py-24 px-6 flex flex-col items-center text-center">
      <h2 className="text-[28px] md:text-[36px] font-extrabold tracking-[-0.02em] mb-4">
        Built for modern execution
      </h2>
      <p className="text-slate text-[16px] max-w-[600px] mb-16">
        VisionBoard combines AI-powered roadmaps, documentation, planning, and execution visibility in one connected workspace.
      </p>

      <div className="flex flex-col gap-6 max-w-5xl w-full text-left">
        {/* Top Row (3 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-auto md:h-[220px]">
          <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-end">
            <h3 className="font-bold text-[18px] mb-2">Plan Smarter</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Generate strategic roadmaps and breakdown milestones.</p>
          </div>
          <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-end">
            <h3 className="font-bold text-[18px] mb-2">Stay Connected</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Link docs, milestones, and workflows directly to your boards and plans.</p>
          </div>
          <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-end">
            <h3 className="font-bold text-[18px] mb-2">Collaborate</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Cross-team visibility across boards, documents, and execution.</p>
          </div>
        </div>
        {/* Bottom Row (2 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-auto md:h-[220px]">
          <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-end">
            <h3 className="font-bold text-[18px] mb-2">Track Execution</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Manage progress, blockers, and milestones simply and across free, premium, and AI tiers.</p>
          </div>
          <div className="bg-white border border-border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-end">
            <h3 className="font-bold text-[18px] mb-2">Stay Aligned</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Keep writing documentation directly connected to tasks inside the powerful generic workspace.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
