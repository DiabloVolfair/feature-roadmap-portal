import RoadmapFeatureCard from "./RoadmapFeatureCard";

function RoadmapColumn({ status, label, features }) {
  return (
    <section
      aria-label={`${label} roadmap column`}
      className="flex flex-col bg-slate-50 rounded-xl border border-slate-200"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
        <span className="text-xs font-medium bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
          {features.length}
        </span>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-16rem)] p-2 flex flex-col gap-2">
        {features.length === 0 ? (
          <div className="flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg min-h-[80px] text-xs text-slate-400">
            No features yet
          </div>
        ) : (
          features.map(feature => (
            <RoadmapFeatureCard key={feature.id} feature={feature} />
          ))
        )}
      </div>
    </section>
  );
}

export default RoadmapColumn;
