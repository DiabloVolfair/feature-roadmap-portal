import { useState, useEffect } from "react";
import { toast } from "sonner";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import FeatureCard from "../components/FeatureCard";
import CreateFeatureModal from "../components/CreateFeatureModal";
import EditFeatureModal from "../components/EditFeatureModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useFeedQueryParams } from "../hooks/useFeedQueryParams";
import { useFeatureFeed, useDeleteFeature } from "../hooks/useFeatures";
import { useAuth } from "../context/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const FEED_LIMIT = 20;

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const CATEGORY_PILLS = [
  { value: "ui_ux", label: "UI/UX" },
  { value: "integrations", label: "Integrations" },
  { value: "performance", label: "Performance" },
  { value: "general", label: "General" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most_upvoted", label: "Most Upvoted" },
  { value: "most_discussed", label: "Most Discussed" },
  { value: "trending", label: "Trending" },
  { value: "relevance", label: "Relevance" },
];

/**
 * HomePage is the public feature feed. Every feed parameter (`search`,
 * `category`, `status`, `sort`, `page`) is read directly from
 * `useFeedQueryParams()` - there is no component-local default state for
 * any of them, so the URL remains the single source of truth (Req 21.3,
 * 23.2, 28.3). Those values are passed straight through to
 * `useFeatureFeed`, which drives the loading-skeleton / error-state (with
 * a `refetch` retry) / empty-state / `FeatureCard` list rendering below
 * (Req 14.1-14.6).
 *
 * The "Submit Idea" control is gated on `useAuth().isAuthenticated`
 * and opens `CreateFeatureModal` (Req 25.1-25.3). Local `useState` is used
 * only for UI state - which modal/dialog is open and which feature it
 * targets, plus viewMode - never for feed parameters.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 21.3, 23.2, 25.1, 25.2,
 * 25.3, 28.3
 */
function HomePage() {
  const { search, category, status, sort, page, setSearch, setCategory, setStatus, setSort, setPage } =
    useFeedQueryParams();
  const { user, isAuthenticated } = useAuth();

  const feedQuery = useFeatureFeed({ page, limit: FEED_LIMIT, search, category, status, sort });
  const { data, isLoading, isError, refetch } = feedQuery;
  const deleteFeature = useDeleteFeature();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingFeature, setDeletingFeature] = useState(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");

  // Local search draft with debounce so typing doesn't spam the URL
  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebouncedValue(searchDraft, 300);

  // Sync debounced value into the URL
  useEffect(() => {
    setSearch(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function handleEdit(feature) {
    setEditingFeature(feature);
    setIsEditModalOpen(true);
  }

  function closeEditModal() {
    setIsEditModalOpen(false);
    setEditingFeature(null);
  }

  function handleDelete(feature) {
    setDeletingFeature(feature);
    setIsConfirmDialogOpen(true);
  }

  function closeConfirmDialog() {
    setIsConfirmDialogOpen(false);
    setDeletingFeature(null);
  }

  function confirmDelete() {
    if (!deletingFeature) return;
    deleteFeature.mutate(deletingFeature.id, {
      onSuccess: () => {
        toast.success("Feature request deleted.");
        closeConfirmDialog();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.message || "Failed to delete feature request. Please try again.");
      },
    });
  }

  // Derive active status tab — when multiple status values are in the URL we
  // won't match a single tab, so fall back to "" (All).
  const activeStatusTab = status.length === 1 ? status[0] : "";

  function handleStatusTab(value) {
    if (value === "") {
      setStatus([]);
    } else {
      setStatus([value]);
    }
  }

  function handleCategoryPill(value) {
    if (category.includes(value)) {
      setCategory(category.filter((c) => c !== value));
    } else {
      setCategory([value]);
    }
  }

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200 py-12 px-4 text-center">
        <h1
          className="text-4xl font-bold text-indigo-600 mb-3"
          aria-label="Feature Request & Public Roadmap Portal"
        >
          What we&apos;re building next
        </h1>
        <p className="text-slate-500 max-w-lg mx-auto mb-6">
          Submit feature ideas, vote on what matters most, and help shape the future of our product.
        </p>

        {/* Search + Submit */}
        <div className="flex items-center justify-center gap-3 max-w-xl mx-auto">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              aria-label="Search feature requests"
              placeholder="Search features and ideas..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              aria-label="New Feature Request"
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              + Submit Idea
            </button>
          )}
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Status tabs */}
        <div className="flex gap-0 border-b border-slate-200 mb-4" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeStatusTab === tab.value}
              onClick={() => handleStatusTab(tab.value)}
              className={`px-4 py-3 text-sm cursor-pointer border-b-2 -mb-px transition-colors ${
                activeStatusTab === tab.value
                  ? "border-indigo-600 text-indigo-600 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Secondary toolbar: category pills + sort + view toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2" aria-label="Filter by category">
            {CATEGORY_PILLS.map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => handleCategoryPill(pill.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${
                  category.includes(pill.value)
                    ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Right side: sort + view mode */}
          <div className="flex items-center gap-2">
            <FilterDropdown label="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />

            {/* Grid / List toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden" aria-label="View mode">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={`px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === "grid"
                    ? "bg-indigo-50 text-indigo-600"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === "list"
                    ? "bg-indigo-50 text-indigo-600"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Feed */}
        {isLoading && (
          <div
            className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "flex flex-col gap-3"}
            aria-label="Loading feature requests"
          >
            {[0, 1, 2, 4].map((key) => (
              <div key={key} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-red-300 bg-red-50 p-6 text-center">
            <p className="text-red-700">Something went wrong loading feature requests.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md px-4 py-2 text-sm font-medium text-red-700 border border-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && data?.items?.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
            No feature requests found.
          </div>
        )}

        {!isLoading && !isError && data?.items?.length > 0 && (
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "flex flex-col gap-3"}>
            {data.items.map((feature) => (
              <FeatureCard
                key={feature.id}
                feature={feature}
                currentUser={user}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {!isLoading && !isError && data?.pagination && (
          <div className="mt-6">
            <Pagination pagination={data.pagination} onPageChange={setPage} />
          </div>
        )}
      </div>

      <CreateFeatureModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <EditFeatureModal isOpen={isEditModalOpen} onClose={closeEditModal} feature={editingFeature} />
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        title="Delete Feature Request"
        message={`Are you sure you want to delete "${deletingFeature?.title ?? ""}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={closeConfirmDialog}
      />
    </div>
  );
}

export default HomePage;
