-- ===========================================================
-- Plan Canje: sale_type, trade_in_data, RPC create_canje_sale
-- ===========================================================

-- 1. Extender CHECK constraint de sales.status
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check
  CHECK (status IN ('pending', 'vendido', 'anulado', 'cancelado', 'canje'));

-- 2. Agregar columna sale_type
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_type text DEFAULT 'standard';
COMMENT ON COLUMN public.sales.sale_type IS 'standard | canje';

-- 3. Agregar columna trade_in_data (JSONB)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS trade_in_data jsonb DEFAULT NULL;
COMMENT ON COLUMN public.sales.trade_in_data IS 'Datos del producto recibido en canje: {variant_id, variant_name, product_name, color, storage, ram, imei, amount_ars, amount_usd, currency, fx_rate_used}';

-- 4. RPC create_canje_sale
CREATE OR REPLACE FUNCTION public.create_canje_sale(
  p_customer_id integer,
  p_seller_id uuid,
  p_sales_channel_id integer,
  p_received_variant_id integer,
  p_received_amount_ars numeric,
  p_received_currency text,
  p_fx_rate_used numeric,
  p_imei text,
  p_items jsonb,
  p_notes text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id bigint;
  v_sale_item_id bigint;
  item jsonb;
  v_quantity integer;
  v_variant_id integer;
  v_usd_price numeric;
  v_subtotal_usd numeric;
  v_total_usd numeric := 0;
  v_total_ars numeric;
  v_received_usd numeric;
  v_cost_price_usd numeric;
  v_tracking_mode text;
  v_product_name text;
  v_variant_name text;
  v_color text;
  v_storage text;
  v_ram text;
  v_received_at timestamptz;
BEGIN
  -- Verificar autorización
  IF NOT is_owner_or_superadmin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Calcular received_usd según moneda
  IF p_received_currency IN ('USD', 'USDT') THEN
    v_received_usd := p_received_amount_ars;
    v_cost_price_usd := p_received_amount_ars;
  ELSIF p_received_currency = 'ARS' AND p_fx_rate_used > 0 THEN
    v_received_usd := p_received_amount_ars / p_fx_rate_used;
    v_cost_price_usd := p_received_amount_ars / p_fx_rate_used;
  ELSE
    RAISE EXCEPTION 'Moneda o cotización inválida para el canje';
  END IF;

  -- Calcular total_usd de los items a comprar
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := coalesce((item ->> 'quantity')::integer, 1);
    v_usd_price := coalesce((item ->> 'usd_price')::numeric, 0);
    IF (item ->> 'is_gift')::boolean IS DISTINCT FROM TRUE THEN
      v_total_usd := v_total_usd + (v_usd_price * v_quantity);
    END IF;
  END LOOP;

  -- total_ars usando la cotización del canje
  v_total_ars := v_total_usd * p_fx_rate_used;

  -- Obtener datos de la variante recibida
  SELECT p.name, pv.variant_name, pv.color, pv.storage, pv.ram, p.inventory_tracking_mode
  INTO v_product_name, v_variant_name, v_color, v_storage, v_ram, v_tracking_mode
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = p_received_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante recibida % no encontrada', p_received_variant_id;
  END IF;

  v_received_at := now();

  -- Insertar la venta
  INSERT INTO public.sales (
    customer_id, seller_id, sales_channel_id,
    total_usd, total_ars, fx_rate_used,
    notes, status, sale_type, trade_in_data
  ) VALUES (
    p_customer_id, p_seller_id, p_sales_channel_id,
    v_total_usd, v_total_ars, p_fx_rate_used,
    coalesce(p_notes, ''), 'pending', 'canje',
    jsonb_build_object(
      'variant_id', p_received_variant_id,
      'variant_name', v_variant_name,
      'product_name', v_product_name,
      'color', v_color,
      'storage', v_storage,
      'ram', v_ram,
      'imei', p_imei,
      'amount_ars', p_received_amount_ars,
      'amount_usd', v_received_usd,
      'currency', p_received_currency,
      'fx_rate_used', p_fx_rate_used
    )
  )
  RETURNING id INTO v_sale_id;

  -- Insertar items de la venta (productos comprados)
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (item ->> 'variant_id')::integer;
    v_quantity := coalesce((item ->> 'quantity')::integer, 1);
    v_usd_price := coalesce((item ->> 'usd_price')::numeric, 0);
    v_subtotal_usd := v_usd_price * v_quantity;

    -- Obtener datos del producto/variante
    SELECT p.name, pv.variant_name, pv.color, pv.storage, pv.ram, pv.cost_price_usd
    INTO v_product_name, v_variant_name, v_color, v_storage, v_ram, v_cost_price_usd
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_variant_id;

    INSERT INTO public.sale_items (
      sale_id, variant_id, product_name, variant_name,
      color, storage, ram,
      usd_price, cost_price_usd, quantity,
      subtotal_usd, subtotal_ars, is_gift
    ) VALUES (
      v_sale_id, v_variant_id, v_product_name, v_variant_name,
      v_color, v_storage, v_ram,
      v_usd_price, v_cost_price_usd, v_quantity,
      v_subtotal_usd, v_subtotal_usd * p_fx_rate_used,
      coalesce((item ->> 'is_gift')::boolean, false)
    );

    -- Descontar stock de variantes compradas (solo si no es regalo)
    IF (item ->> 'is_gift')::boolean IS DISTINCT FROM TRUE THEN
      UPDATE public.product_variants
      SET stock = stock - v_quantity, updated_at = now()
      WHERE id = v_variant_id;
    END IF;
  END LOOP;

  -- Incrementar stock de variante recibida + actualizar costo
  UPDATE public.product_variants
  SET stock = coalesce(stock, 0) + 1,
      cost_price_usd = v_cost_price_usd,
      updated_at = now()
  WHERE id = p_received_variant_id;

  -- Si es serializada, crear inventory_unit
  IF v_tracking_mode = 'serial' THEN
    IF p_imei IS NULL OR trim(p_imei) = '' THEN
      RAISE EXCEPTION 'La variante接收ida es serializada y requiere IMEI/SN';
    END IF;

    INSERT INTO public.inventory_units (
      variant_id, identifier_value, status,
      received_at, notes, updated_by
    ) VALUES (
      p_received_variant_id, trim(p_imei), 'available',
      v_received_at, 'Ingreso por plan canje', auth.uid()
    );

    -- Registrar evento
    INSERT INTO public.inventory_unit_events (
      inventory_unit_id, event_type, from_status, to_status,
      related_table, related_id, notes
    )
    SELECT
      iu.id, 'canje_received', null, 'available',
      'sales', v_sale_id,
      'Ingreso por plan canje - ' || coalesce(v_product_name, '') || ' ' || coalesce(v_variant_name, '')
    FROM public.inventory_units iu
    WHERE iu.variant_id = p_received_variant_id
      AND iu.identifier_value = trim(p_imei)
    ORDER BY iu.id DESC
    LIMIT 1;
  END IF;

  RETURN json_build_object('ok', true, 'sale_id', v_sale_id);
END;
$function$;

-- 5. Permisos
GRANT EXECUTE ON FUNCTION public.create_canje_sale(
  integer, uuid, integer, integer, numeric, text, numeric, text, jsonb, text
) TO authenticated;
