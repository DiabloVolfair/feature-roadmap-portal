import BackendStatusCard from "../components/BackendStatusCard";

const PROJECT_TITLE = "Feature Request & Public Roadmap Portal";
const PROJECT_DESCRIPTION =
  "Submit feature ideas, vote on what matters most, and follow their journey from request to roadmap in one transparent, public space.";

/**
 * HomePage composes the project title, description, backend connectivity
 * status, and a placeholder for the (not-yet-built) feature feed.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 13.3
 */
function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-900">{PROJECT_TITLE}</h1>
        <p className="text-slate-600">{PROJECT_DESCRIPTION}</p>
      </div>

      <BackendStatusCard />

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
        Feature feed coming soon
      </div>
    </div>
  );
}

export default HomePage;
