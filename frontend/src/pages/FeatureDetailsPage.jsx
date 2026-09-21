import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useDeleteFeature, useFeature } from "../hooks/useFeatures";
import { useAuth } from "../context/AuthContext";
import { categoryBadgeClass, statusBadgeClass } from "../utils/badgeColors";
import MarkdownRenderer from "../components/markdown/MarkdownRenderer";
import AuthorCard from "../components/AuthorCard";
import StatusTimeline from "../components/StatusTimeline";
import RelatedFeatures from "../components/RelatedFeatures";
import ShareButton from "../components/ShareButton";
import { VotingPlaceholder } from "../components/Placeholders";
import DiscussionSection from "../components/DiscussionSection";
import FeatureDetailsSkeleton from "../components/skeletons/FeatureDetailsSkeleton";
import RelatedFeaturesSkeleton from "../components/skeletons/RelatedFeaturesSkeleton";
import MarkdownContentSkeleton from "../components/skeletons/MarkdownContentSkeleton";
import FeatureNotFoundState from "../components/FeatureNotFoundState";
import EditFeatureModal from "../components/EditFeatureModal";
import ConfirmDialog from "../components/ConfirmDialog";
import VoteButton from "../components/VoteButton";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * useDialogFocusTrap moves focus into `containerRef`'s first focusable
 * element when `isOpen` becomes true, confines Tab/Shift+Tab navigation
 * within that container while open, and returns focus to the element that
 * had focus immediately before opening once `isOpen` becomes false.
 *
 * Neither EditFeatureModal nor ConfirmDialog implements its own focus
 * trap, so FeatureDetailsPage implements one shared implementation here
 * and applies it to both dialogs (Req 16.8).
 */
function useDialogFocusTrap(containerRef, isOpen) {
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    triggerRef.current = document.activeElement;

    const container = containerRef.current;
    const focusFirst = () => {
      const focusable = container?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable && focusable.length > 0) {
        focusable[0].focus();
      } else {
        container?.focus();
      }
    };
    // Defer to the next tick so the dialog's content has mounted.
    const timeoutId = setTimeout(focusFirst, 0);

    function handleKeyDown(event) {
      if (event.key !== "Tab") return;
      const focusable = Array.from(container?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus?.();
    };
  }, [isOpen, containerRef]);
}

/**
 * FeatureDetailsPage fetches a single feature request via the unmodified
 * `useFeature(featureId)` and renders the full Requirement 4.1 section
 * order: breadcrumb, title, status/category badges, AuthorCard,
 * created/updated dates, the rendered markdown content, a ShareButton,
 * gated Edit/Delete buttons, StatusTimeline, RelatedFeatures,
 * VotingPlaceholder, and CommentsPlaceholder.
 *
 * Loading renders the three skeleton components (Req 14.1). A 404 error
 * renders FeatureNotFoundState (Req 14.2). Any other error renders an
 * inline retry state wired to `refetch()`, disabled while `isFetching` so
 * a rapid repeated click can't issue a second concurrent request
 * (Req 14.3, 14.4).
 *
 * Edit opens EditFeatureModal pre-filled with the current feature; Delete
 * opens ConfirmDialog before calling `useDeleteFeature()` - success shows a
 * success Toast and navigates to `/`, failure shows an error Toast, closes
 * the dialog, and leaves the user on the page (Req 4.6). Both dialogs share
 * a single focus-trap implementation (`useDialogFocusTrap`) since neither
 * EditFeatureModal nor ConfirmDialog implements its own (Req 16.8).
 *
 * The action bar (Edit/Delete/Share) is sticky at desktop width and a
 * full-width, touch-sized button group at mobile width (Req 17.2).
 * RelatedFeatures/breadcrumb navigation always pushes a history entry,
 * never replaces (Req 15.3, 15.5). No element carries a `tabindex` greater
 * than 0 - Tab order follows the page's visual reading order.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 14.1, 14.2, 14.3,
 * 14.4, 15.2, 15.3, 15.4, 15.5, 15.6, 16.1, 16.2, 16.3, 16.8, 17.1, 17.2,
 * 17.4, 17.5
 */
function FeatureDetailsPage() {
  const { featureId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feature, isLoading, isError, error, isFetching, refetch } = useFeature(featureId);
  const deleteFeature = useDeleteFeature();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const editDialogRef = useRef(null);
  const confirmDialogRef = useRef(null);
  useDialogFocusTrap(editDialogRef, isEditModalOpen);
  useDialogFocusTrap(confirmDialogRef, isConfirmDialogOpen);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 sm:px-6">
        <FeatureDetailsSkeleton />
        <MarkdownContentSkeleton />
        <RelatedFeaturesSkeleton />
      </div>
    );
  }

  if (isError && error?.response?.status === 404) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <FeatureNotFoundState />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-red-300 bg-red-50 p-6 text-center">
          <p className="text-red-700">Loading this feature's details failed. Please try again.</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFetching ? "Retrying..." : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(feature.is_owner);
  const isAdmin = Boolean(feature.is_admin);
  const canEdit = isOwner;
  const canDelete = isOwner || isAdmin;
  const showUpdatedDate = feature.updated_at !== feature.created_at;

  const authorCardProps = isOwner
    ? { authorName: feature.author_name, role: user?.role ?? "user", isVerified: Boolean(user?.is_verified) }
    : { authorName: feature.author_name, role: "user", isVerified: false };

  function closeConfirmDialog() {
    setIsConfirmDialogOpen(false);
  }

  function confirmDelete() {
    deleteFeature.mutate(feature.id, {
      onSuccess: () => {
        toast.success("Feature request deleted.");
        navigate("/");
      },
      onError: (mutationError) => {
        toast.error(mutationError?.response?.data?.message || "Failed to delete feature request. Please try again.");
        closeConfirmDialog();
      },
    });
  }

  return (
    <article className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-24 sm:px-6 md:pb-6">
      <nav aria-label="Breadcrumb">
        <Link
          to="/"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          ← Back to feed
        </Link>
      </nav>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{feature.title}</h1>
              <VoteButton
                featureId={feature.id}
                voteCount={feature.vote_count}
                hasVoted={feature.has_voted}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(feature.status)}`}
              >
                {feature.status}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${categoryBadgeClass(feature.category)}`}
              >
                {feature.category}
              </span>
            </div>
          </div>

          <AuthorCard {...authorCardProps} createdAt={feature.created_at} />

          <div className="text-sm text-slate-500">
            Created {new Date(feature.created_at).toLocaleDateString()}
            {showUpdatedDate && <> · Updated {new Date(feature.updated_at).toLocaleDateString()}</>}
          </div>

          <MarkdownRenderer>{feature.description_markdown}</MarkdownRenderer>

          <StatusTimeline status={feature.status} />

          {feature.status !== "under_review" && (
            <Link to="/roadmap" className="text-sm text-indigo-600 hover:underline">
              View on Roadmap →
            </Link>
          )}

          <RelatedFeatures relatedFeatures={feature.related_features} />

          <VotingPlaceholder />
          <DiscussionSection featureId={feature.id} commentCount={feature.comment_count} />
        </div>

        {/* Desktop action bar: sticky within the secondary column while the
            main content scrolls (Req 17.2). Hidden at mobile width in favor
            of the fixed bottom bar below. */}
        <div className="hidden w-56 shrink-0 flex-col gap-2 md:sticky md:top-4 md:flex">
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label="Edit feature request"
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setIsConfirmDialogOpen(true)}
              aria-label="Delete feature request"
              className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Delete
            </button>
          )}
          <ShareButton />
        </div>
      </div>

      {/* Mobile action bar: full-width, touch-sized (min 44x44px), fixed to
          the bottom of the viewport (Req 17.2). */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-slate-200 bg-white p-3 md:hidden">
        {canEdit && (
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            aria-label="Edit feature request"
            className="min-h-[44px] flex-1 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Edit
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setIsConfirmDialogOpen(true)}
            aria-label="Delete feature request"
            className="min-h-[44px] flex-1 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Delete
          </button>
        )}
        <div className="min-h-[44px] flex-1">
          <ShareButton />
        </div>
      </div>

      <div ref={editDialogRef}>
        <EditFeatureModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} feature={feature} />
      </div>

      <div ref={confirmDialogRef}>
        <ConfirmDialog
          isOpen={isConfirmDialogOpen}
          title="Delete Feature Request"
          message={`Are you sure you want to delete "${feature.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={closeConfirmDialog}
        />
      </div>
    </article>
  );
}

export default FeatureDetailsPage;
