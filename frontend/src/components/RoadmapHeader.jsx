function RoadmapHeader({ totalPlanned, totalInProgress, totalCompleted }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Public Roadmap</h1>
      <p className="text-slate-500 mb-4">Track our feature development progress.</p>
      <div className="flex flex-wrap gap-4">
        {[
          ["Planned", totalPlanned],
          ["In Progress", totalInProgress],
          ["Completed", totalCompleted],
        ].map(([label, count]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RoadmapHeader;
