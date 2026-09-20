/**
 * Pagination renders Previous/current-page-of-total/Next controls for the
 * feature feed.
 *
 * Disabled state trusts the backend's `has_previous`/`has_next` directly,
 * never recomputed client-side (Req 22.2).
 *
 * Requirements: 22.1, 22.2, 22.3
 */
function Pagination({ pagination, onPageChange }) {
  const { page, total_pages, has_previous, has_next } = pagination;

  return (
    <div className="flex items-center justify-center gap-4 py-4">
      <button
        type="button"
        disabled={!has_previous}
        onClick={() => onPageChange(page - 1)}
        className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {total_pages}
      </span>
      <button
        type="button"
        disabled={!has_next}
        onClick={() => onPageChange(page + 1)}
        className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}

export default Pagination;
