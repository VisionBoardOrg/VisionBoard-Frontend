export default function FeatureSection3() {
  return (
    <section className="py-16 md:py-24 px-4 sm:px-6 flex flex-col items-center text-center">
      <h2 className="text-[28px] max-w-[600px] md:text-[36px] font-extrabold tracking-[-0.02em] mb-4">
        Built for modern execution
      </h2>
      <p className="text-slate text-[16px] max-w-[600px] mb-10 md:mb-16">
        VisionBoard combines AI-powered roadmaps, documentation, planning, and execution visibility in one connected workspace.
      </p>

      <div className="flex flex-col gap-6 max-w-5xl w-full text-left">
        {/* Top Row (3 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          <div className="bg-white border border-border p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-[18px] mb-2">Plan Smarter</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Generate strategic roadmaps and execution flows with AI.</p>
          </div>
          <div className="bg-white border border-border p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-[18px] mb-2">Stay Connected</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Link notes, decisions, and workflows directly to your team&apos;s execution plans.</p>
          </div>
          <div className="bg-white border border-border p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow sm:col-span-2 md:col-span-1">
            <h3 className="font-bold text-[18px] mb-2">Collaborate</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Give teams shared visibility with live collaboration, updates, and comments.</p>
          </div>
        </div>
        {/* Bottom Row (2 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-border p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-[18px] mb-2">Track Execution</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Monitor progress, blockers, and milestone completion across every initiative in real time.</p>
          </div>
          <div className="bg-white border border-border p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-[18px] mb-2">Stay Aligned</h3>
            <p className="text-slate text-[14px] leading-[1.6]">Bring planning, documentation, and execution into one shared AI-powered workspace.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
