import { useEffect, useState } from "react";
import { toast } from "sonner";
import { validateFeatureForm } from "./CreateFeatureModal";
import { useUpdateFeature } from "../hooks/useFeatures";
import MarkdownEditor from "./MarkdownEditor";
import CharacterCounter from "./CharacterCounter";

const CATEGORY_OPTIONS = [
  { value: "ui_ux", label: "UI/UX" },
  { value: "integrations", label: "Integrations" },
  { value: "performance", label: "Performance" },
  { value: "general", label: "General" },
];

const DESCRIPTION_MAX_LENGTH = 10_000;

/**
 * EditFeatureModal renders a form for editing an existing feature request's
 * `title`, `description_markdown` (edited via MarkdownEditor, with a live
 * character counter beneath it, per Req 8.2-8.5), and `category`. It is a
 * near-twin of CreateFeatureModal, minus server-assigned/access-controlled
 * fields, plus prefill behavior - there is no `status` field/control
 * anywhere, because `FeatureUpdate` structurally omits `status` and status
 * changes are out of scope for non-admins this sprint (Req 18.1).
 *
 * The Edit trigger's author-gated visibility is FeatureCard's
 * responsibility (Req 19.2's sibling rule for Edit, enforced there via
 * `currentUser?.id === feature.author_id`); this component is only the
 * modal content shown once that trigger opens it, so it takes no
 * `currentUser` prop of its own.
 *
 * Local `title`/`description_markdown`/`category` state is prefilled from
 * `feature` whenever the modal opens for a (possibly different) feature,
 * via a `useEffect` keyed on `feature` and `isOpen` (Req 18.2).
 *
 * Fields are validated via the shared `validateFeatureForm` before calling
 * `useUpdateFeature()`'s mutation with `{ featureId, payload }` (Req 18.3,
 * 18.4). On success, shows a success Toast and closes the modal via
 * `onClose`, relying on Feature_Hooks' cache invalidation (not a manual
 * refetch) to refresh the feed/details data (Req 18.5). On failure, shows
 * an error Toast and stays open with the entered values intact (Req 18.6).
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 24.5, 25.4
 */
function EditFeatureModal({ isOpen, onClose, feature }) {
  const [title, setTitle] = useState("");
  const [descriptionMarkdown, setDescriptionMarkdown] = useState("");
  const [category, setCategory] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const updateFeature = useUpdateFeature();

  useEffect(() => {
    if (isOpen && feature) {
      setTitle(feature.title);
      setDescriptionMarkdown(feature.description_markdown);
      setCategory(feature.category);
      setFieldErrors({});
    }
  }, [isOpen, feature]);

  if (!isOpen) return null;

  function handleSubmit(event) {
    event.preventDefault();

    const values = { title, description_markdown: descriptionMarkdown, category };
    const errors = validateFeatureForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    updateFeature.mutate(
      { featureId: feature.id, payload: values },
      {
        onSuccess: () => {
          toast.success("Feature request updated.");
          onClose();
        },
        onError: (error) => {
          toast.error(error?.response?.data?.message || "Failed to update feature request. Please try again.");
        },
      }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-feature-modal-title"
    >
      <div className="max-w-md mx-auto p-6 rounded-lg border border-slate-200 bg-white shadow-sm w-full">
        <h2 id="edit-feature-modal-title" className="text-xl font-semibold text-slate-900 mb-4">
          Edit Feature Request
        </h2>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-feature-title" className="text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="edit-feature-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
            {fieldErrors.title && <p className="text-sm text-red-600">{fieldErrors.title}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-feature-description" className="text-sm font-medium text-slate-700">
              Description
            </label>
            <MarkdownEditor value={descriptionMarkdown} onChange={setDescriptionMarkdown} />
            <CharacterCounter length={descriptionMarkdown.length} max={DESCRIPTION_MAX_LENGTH} />
            {fieldErrors.description_markdown && (
              <p className="text-sm text-red-600">{fieldErrors.description_markdown}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-feature-category" className="text-sm font-medium text-slate-700">
              Category
            </label>
            <select
              id="edit-feature-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">Select a category</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.category && <p className="text-sm text-red-600">{fieldErrors.category}</p>}
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateFeature.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditFeatureModal;
