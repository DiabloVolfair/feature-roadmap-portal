/**
 * FilterDropdown is the one generic, reusable dropdown used for all three of
 * the feed's filter/sort controls (category, status, sort), rather than
 * three bespoke, near-duplicate components (Req 21.1).
 *
 * `options` is an array of `{ value, label }` objects. `value` is the
 * currently selected value: a string for the single-select case (`sort`),
 * or an array of strings when `multiple` is true (`category`/`status`,
 * which combine with OR within a filter type per this sprint's filter
 * semantics). `onChange` is called with the new value (string or array,
 * matching `multiple`) on selection; wiring that value into the URL via
 * `useFeedQueryParams` is the caller's responsibility (Req 21.2).
 */
function FilterDropdown({ label, options, value, onChange, multiple = false }) {
  function handleChange(event) {
    if (multiple) {
      const selected = Array.from(event.target.selectedOptions, (option) => option.value);
      onChange(selected);
    } else {
      onChange(event.target.value);
    }
  }

  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        aria-label={label}
        multiple={multiple}
        value={value}
        onChange={handleChange}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {!multiple && <option value="">All</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default FilterDropdown;
