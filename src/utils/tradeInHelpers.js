/**
 * Helpers for reading trade_in_data from sales.
 * Supports both old (single product) and new (multi-product) formats.
 *
 * OLD format: { variant_id, variant_name, product_name, ...amount_ars }
 * NEW format: { items: [...], total_amount_ars, total_amount_usd, fx_rate_used }
 */

export const getReceivedItems = (tradeInData) => {
  if (!tradeInData) return [];
  if (Array.isArray(tradeInData.items)) return tradeInData.items;
  if (tradeInData.variant_id) return [tradeInData];
  return [];
};

export const getTotalReceivedArs = (tradeInData) => {
  if (!tradeInData) return 0;
  if (tradeInData.total_amount_ars != null) return Number(tradeInData.total_amount_ars);
  return Number(tradeInData.amount_ars || 0);
};

export const getTotalReceivedUsd = (tradeInData) => {
  if (!tradeInData) return 0;
  if (tradeInData.total_amount_usd != null) return Number(tradeInData.total_amount_usd);
  return Number(tradeInData.amount_usd || 0);
};

export const getReceivedFxRate = (tradeInData) => {
  if (!tradeInData) return 0;
  return Number(tradeInData.fx_rate_used || 0);
};
