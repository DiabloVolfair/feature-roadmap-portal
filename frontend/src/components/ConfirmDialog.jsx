/**
 * ConfirmDialog is a generic, reusable confirmation dialog, parametrized by
 * a title, message, and confirm callback, rather than a feature-specific
 * component, so it can be reused for other future confirmation flows (e.g.
 * feature deletion this sprint, and potentially other destructive actions
 * later).
 *
 * Only rendered when `isOpen` is true. Dismissing via Cancel never calls
 * `onConfirm`.
 *
 * Requirements: 19.1, 19.3
 */
function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Confirm" }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="max-w-sm mx-auto p-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 id="confirm-dialog-title" className="text-xl font-semibold text-slate-900 mb-2">
          {title}
        </h2>
        <p className="text-sm text-slate-600 mb-4">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
