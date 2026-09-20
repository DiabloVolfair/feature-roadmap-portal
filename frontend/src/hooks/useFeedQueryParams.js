import { useSearchParams } from "react-router-dom";

/**
 * Typed getters/setters for the feed's `search`/`category`/`status`/`sort`/`page`
 * state, keeping all of it exclusively in the URL via `useSearchParams` (Req 23.1-23.3).
 *
 * Every setter except `setPage` resets `page` back to `1`. Changing what's being
 * searched/filtered/sorted while remaining on a stale page number (e.g. page 5 of a
 * now much shorter result set) would be surprising, so any filter/sort/search change
 * resets to page 1 - the conventional feed UX.
 */
export function useFeedQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const category = searchParams.getAll("category");
  const status = searchParams.getAll("status");
  const sort = searchParams.get("sort") ?? "newest";
  const page = Number(searchParams.get("page") ?? "1");

  function updateParams(updates) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value != null && value !== "") next.set(key, value);
    }
    setSearchParams(next);
  }

  return {
    search, category, status, sort, page,
    setSearch: (value) => updateParams({ search: value, page: "1" }),
    setCategory: (values) => updateParams({ category: values, page: "1" }),
    setStatus: (values) => updateParams({ status: values, page: "1" }),
    setSort: (value) => updateParams({ sort: value, page: "1" }),
    setPage: (value) => updateParams({ page: String(value) }),
  };
}
