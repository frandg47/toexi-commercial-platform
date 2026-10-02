-- ============================================================
-- Backfill: asignar SKU a todas las variantes existentes
-- ============================================================
-- Idempotente: solo completa las variantes que aun no tienen SKU.
-- Requiere haber aplicado 20260913_variant_sku_generation.sql

DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.rpc_generate_skus_backfill_all() INTO v_result;
  RAISE NOTICE 'SKU backfill: % generados, % errores',
    v_result ->> 'generated', v_result ->> 'errors';
END $$;

-- Verificacion rapida (ejecutar manualmente en Supabase si se desea):
--
--   SELECT count(*) AS sin_sku FROM public.product_variants
--   WHERE coalesce(btrim(sku), '') = '';
--
--   SELECT id, sku, variant_name, color FROM public.product_variants
--   ORDER BY id LIMIT 50;
