const PAGE_SIZE = 10;
import { supabase } from "@/lib/supabaseClient";

export async function getAdminSales(page, filters = {}) {
  let query = supabase
    .from("admin_sales_view")
    .select("*", { count: "exact" })
    .order("sale_date", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (filters.start_date)
    query = query.gte("sale_date", filters.start_date);
  if (filters.end_date)
    query = query.lte("sale_date", filters.end_date);

  if (filters.seller_id)
    query = query.eq("seller_id", filters.seller_id);

  if (filters.status)
    query = query.eq("status", filters.status);

  return await query;
}
