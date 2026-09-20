import { useState } from "react";
import { toast } from "sonner";
import BackendStatusCard from "../components/BackendStatusCard";
import SearchBar from "../components/SearchBar";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import FeatureCard from "../components/FeatureCard";
import CreateFeatureModal from "../components/CreateFeatureModal";
import EditFeatureModal from "../components/EditFeatureModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useFeedQueryParams } from "../hooks/useFeedQueryParams";
import { useFeatureFeed, useDeleteFeature } from "../hooks/useFeatures";
import { useAuth } from "../context/AuthContext";

const PROJECT_TITLE = "Feature Request & Public Roadmap Portal";
const PROJECT_DESCRIPTION =
  "Submit feature ideas, vote on what matters most, and follow their journey from request to roadmap in one transparent, public space.";

const FEED_LIMIT = 20;

const CATEGORY_OPTIONS = [
  { value: "ui_ux", label: "UI/UX" },
  { value: "integrations", label: "Integrations" },
  { value: "performance", label: "Performance" },
  { value: "general", label: "General" },
];

const STATUS_OPTIONS = [
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
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
 * The "New Feature Request" control is gated on `useAuth().isAuthenticated`
 * and opens `CreateFeatureModal` (Req 25.1-25.3). Local `useState` is used
 * only for UI state - which modal/dialog is open and which feature it
 * targets - never for feed parameters.
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-900">{PROJECT_TITLE}</h1>
        <p className="text-slate-600">{PROJECT_DESCRIPTION}</p>
      </div>

      <BackendStatusCard />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Feature Requests</h2>
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            New Feature Request
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <SearchBar value={search} onSearchChange={setSearch} />
        </div>
        <FilterDropdown
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
          multiple
        />
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          multiple
        />
        <FilterDropdown label="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3" aria-label="Loading feature requests">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
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
        <div className="flex flex-col gap-4">
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
        <Pagination pagination={data.pagination} onPageChange={setPage} />
      )}

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
