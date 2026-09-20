import { useEffect, useState } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

/**
 * SearchBar is a reusable search input that debounces its value by 300ms
 * before notifying the caller, so that search-as-you-type doesn't flood the
 * backend with a request per keystroke (Req 20.1, 20.2). It holds its own
 * local "draft" state for what's currently typed, and only calls
 * `onSearchChange` once the debounced value settles; wiring that value into
 * the URL via `useFeedQueryParams` is the caller's responsibility (Req
 * 20.3, 28.4).
 */
function SearchBar({ value, onSearchChange }) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft, 300);

  useEffect(() => {
    onSearchChange(debounced);
  }, [debounced]);

  return (
    <label className="block text-sm font-medium text-slate-700">
      Search
      <input
        type="text"
        aria-label="Search feature requests"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search feature requests"
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

export default SearchBar;
