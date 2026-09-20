/**
 * AuthorCard renders a feature's author summary: a circular avatar
 * (initials, or a generic person icon when the name is empty), the
 * author's name, a role badge (exactly two states: "user"/"admin"), an
 * optional verified badge, and a "Submitted on [date]" line.
 *
 * Pure presentational component - no data fetching, no context usage.
 * All props are supplied by the parent (FeatureDetailsPage), which
 * decides what role/isVerified values to pass depending on viewer
 * identity (Req 9.7). Never rendered as a link or navigable element
 * (Req 9.6), because no user profile page exists yet.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

/**
 * Derives up to two uppercased initials from a name, e.g. "Ada Lovelace"
 * -> "AL", "Ada" -> "A". Returns an empty string for an empty/whitespace
 * only name so the caller can fall back to the generic person icon
 * (Req 9.2).
 */
function getInitials(name) {
  if (!name || !name.trim()) return "";
  const words = name.trim().split(/\s+/);
  const initials = words.slice(0, 2).map((word) => word[0].toUpperCase());
  return initials.join("");
}

function PersonIcon() {
  return (
    <svg
      className="h-5 w-5 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0"
      />
    </svg>
  );
}

function AuthorCard({ authorName, role, isVerified, createdAt }) {
  const initials = getInitials(authorName);
  const isAdmin = role === "admin";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-500 text-sm font-semibold text-white"
        aria-hidden="true"
      >
        {initials ? initials : <PersonIcon />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{authorName}</span>
          <span
            className={
              isAdmin
                ? "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800"
                : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
            }
          >
            {isAdmin ? "Admin" : "User"}
          </span>
          {isVerified && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Verified
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          Submitted on {new Date(createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

export default AuthorCard;
