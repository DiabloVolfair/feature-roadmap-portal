import { useState } from "react";
import { toast } from "sonner";
import { useCreateFeature } from "../hooks/useFeatures";

const CATEGORY_OPTIONS = [
  { value: "ui_ux", label: "UI/UX" },
  { value: "integrations", label: "Integrations" },
  { value: "performance", label: "Performance" },
  { value: "general", label: "General" },
];

const EMPTY_FORM = { title: "", description_markdown: "", category: "" };

/**
 * validateFeatureForm is a pure function that independently validates each
 * feature field against its documented bound and returns a map of field
 * errors ({} means the form is valid). Colocated with CreateFeatureModal,
 * following the `validateSignupForm`-in-`SignupPage.jsx` pattern; reused by
 * EditFeatureModal (Req 17.2, 18.3).
 *
 * Requirements: 17.3, 18.3
 */
export function validateFeatureForm({ title, description_markdown, category }) {
  const errors = {};
  if (title.trim().length < 5 || title.length > 120) errors.title = "Title must be 5-120 characters.";
  if (description_markdown.trim().length < 20 || description_markdown.length > 10_000) {
    errors.description_markdown = "Description must be 20-10,000 characters.";
  }
  if (!category) errors.category = "Select a category.";
  return errors;
}

/**
 * CreateFeatureModal renders a form for submitting a new feature request:
 * `title`, `description_markdown` (plain-text textarea, no live preview or
 * rendering - full markdown rendering is Sprint 2B's job), and a `category`
 * select populated with the four Feature_Category values (Req 17.1).
 *
 * Fields are validated via `validateFeatureForm` before calling
 * `useCreateFeature()`'s mutation (Req 17.3, 17.4). On success, shows a
 * success Toast, resets local state, and closes the modal via `onClose`,
 * relying on Feature_Hooks' cache invalidation (not a manual refetch) to
 * refresh the feed (Req 17.5). On failure, shows an error Toast and stays
 * open with the entered values intact (Req 17.6).
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 24.5, 25.4
 */
function CreateFeatureModal({ isOpen, onClose }) {
  const [title, setTitle] = useState(EMPTY_FORM.title);
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(EMPTY_FORM.description_markdown);
  const [category, setCategory] = useState(EMPTY_FORM.category);
  const [fieldErrors, setFieldErrors] = useState({});
  const createFeature = useCreateFeature();

  if (!isOpen) return null;

  function resetForm() {
    setTitle(EMPTY_FORM.title);
    setDescriptionMarkdown(EMPTY_FORM.description_markdown);
    setCategory(EMPTY_FORM.category);
    setFieldErrors({});
  }

  function handleSubmit(event) {
    event.preventDefault();

    const values = { title, description_markdown: descriptionMarkdown, category };
    const errors = validateFeatureForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    createFeature.mutate(values, {
      onSuccess: () => {
        toast.success("Feature request created.");
        resetForm();
        onClose();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.message || "Failed to create feature request. Please try again.");
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-feature-modal-title"
    >
      <div className="max-w-md mx-auto p-6 rounded-lg border border-slate-200 bg-white shadow-sm w-full">
        <h2 id="create-feature-modal-title" className="text-xl font-semibold text-slate-900 mb-4">
          New Feature Request
        </h2>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="feature-title" className="text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="feature-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
            {fieldErrors.title && <p className="text-sm text-red-600">{fieldErrors.title}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="feature-description" className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="feature-description"
              rows={5}
              value={descriptionMarkdown}
              onChange={(event) => setDescriptionMarkdown(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
            {fieldErrors.description_markdown && (
              <p className="text-sm text-red-600">{fieldErrors.description_markdown}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="feature-category" className="text-sm font-medium text-slate-700">
              Category
            </label>
            <select
              id="feature-category"
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
              disabled={createFeature.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateFeatureModal;
