const DEFAULT_PAGE_SIZE = 1000;

/**
 * Fetch every row from a Supabase query using PostgREST range pagination.
 * The query factory receives inclusive `from` and `to` indexes and must apply
 * a deterministic order before the range to avoid skipping rows between pages.
 */
export async function fetchAllSupabaseRows(queryForRange, pageSize = DEFAULT_PAGE_SIZE) {
  if (typeof queryForRange !== "function") {
    throw new TypeError("queryForRange debe ser una función");
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError("pageSize debe ser un entero positivo");
  }

  const rows = [];
  for (let from = 0; ; ) {
    const { data, error } = await queryForRange(from, from + pageSize - 1);
    if (error) throw error;

    const page = data || [];
    if (page.length === 0) return rows;
    rows.push(...page);
    // Advance by the actual returned count in case the project Max Rows is
    // configured below the requested range size.
    from += page.length;
  }
}
