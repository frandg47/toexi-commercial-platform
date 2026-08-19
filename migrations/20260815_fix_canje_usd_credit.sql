-- ===========================================================
-- Fix: credito de canje USD/USDT convertido correctamente a ARS
-- p_received_amount_ars representa siempre el valor en ARS.
-- ===========================================================

DROP FUNCTION IF EXISTS public.create_canje_sale(
  integer, uuid, integer, integer, numeric, text, numeric, text, jsonb, text
);

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
  v_inventory_tracking_mode text;
  v_item_cost_price_usd numeric;
  v_inventory_unit_id bigint;
  v_inventory_unit public.inventory_units%rowtype;
  v_requested_units_count integer;
  v_distinct_units_count integer;
BEGIN
  IF NOT is_owner_or_superadmin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_received_amount_ars <= 0 OR p_fx_rate_used <= 0 THEN
    RAISE EXCEPTION 'El monto y la cotización deben ser mayores a cero';
  END IF;

  -- El parámetro siempre llega en ARS. La moneda solo indica cómo
  -- se cotizó el producto recibido y permite conservar su valor USD.
  IF p_received_currency IN ('USD', 'USDT', 'ARS') THEN
    v_received_usd := p_received_amount_ars / p_fx_rate_used;
    v_cost_price_usd := v_received_usd;
  ELSE
    RAISE EXCEPTION 'Moneda inválida para el canje';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := coalesce((item ->> 'quantity')::integer, 1);
    v_usd_price := coalesce((item ->> 'usd_price')::numeric, 0);
    IF (item ->> 'is_gift')::boolean IS DISTINCT FROM TRUE THEN
      v_total_usd := v_total_usd + (v_usd_price * v_quantity);
    END IF;
  END LOOP;

  v_total_ars := v_total_usd * p_fx_rate_used;

  SELECT p.name, pv.variant_name, pv.color, pv.storage, pv.ram, p.inventory_tracking_mode
  INTO v_product_name, v_variant_name, v_color, v_storage, v_ram, v_tracking_mode
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = p_received_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante recibida % no encontrada', p_received_variant_id;
  END IF;

  v_received_at := now();

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

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (item ->> 'variant_id')::integer;
    v_quantity := coalesce((item ->> 'quantity')::integer, 1);
    v_usd_price := coalesce((item ->> 'usd_price')::numeric, 0);
    v_subtotal_usd := v_usd_price * v_quantity;

    SELECT p.name, pv.variant_name, pv.color, pv.storage, pv.ram, pv.cost_price_usd, p.inventory_tracking_mode
    INTO v_product_name, v_variant_name, v_color, v_storage, v_ram, v_item_cost_price_usd, v_inventory_tracking_mode
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_variant_id;

    INSERT INTO public.sale_items (
      sale_id, variant_id, product_name, variant_name,
      color, storage, ram, usd_price, cost_price_usd, quantity,
      subtotal_usd, subtotal_ars, is_gift
    ) VALUES (
      v_sale_id, v_variant_id, v_product_name, v_variant_name,
      v_color, v_storage, v_ram, v_usd_price, v_item_cost_price_usd, v_quantity,
      v_subtotal_usd, v_subtotal_usd * p_fx_rate_used,
      coalesce((item ->> 'is_gift')::boolean, false)
    )
    RETURNING id INTO v_sale_item_id;

    IF coalesce(v_inventory_tracking_mode, 'quantity') = 'serial'
       AND (item ->> 'is_gift')::boolean IS NOT TRUE THEN
      IF NOT (item ? 'inventory_unit_ids') OR jsonb_typeof(item -> 'inventory_unit_ids') <> 'array' THEN
        RAISE EXCEPTION 'Debes seleccionar unidades serializadas para la variante %', v_variant_id;
      END IF;

      SELECT jsonb_array_length(item -> 'inventory_unit_ids') INTO v_requested_units_count;
      SELECT count(distinct value::bigint)
      INTO v_distinct_units_count
      FROM jsonb_array_elements_text(item -> 'inventory_unit_ids');

      IF v_requested_units_count <> v_quantity OR v_distinct_units_count <> v_quantity THEN
        RAISE EXCEPTION 'La cantidad de unidades serializadas no coincide con la cantidad para la variante %', v_variant_id;
      END IF;

      FOR v_inventory_unit_id IN
        SELECT value::bigint FROM jsonb_array_elements_text(item -> 'inventory_unit_ids')
      LOOP
        SELECT * INTO v_inventory_unit
        FROM public.inventory_units
        WHERE id = v_inventory_unit_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'No se encontró la unidad %', v_inventory_unit_id;
        END IF;
        IF v_inventory_unit.variant_id <> v_variant_id THEN
          RAISE EXCEPTION 'La unidad % no pertenece a la variante %', v_inventory_unit_id, v_variant_id;
        END IF;
        IF v_inventory_unit.status <> 'available' THEN
          RAISE EXCEPTION 'La unidad % ya no está disponible', v_inventory_unit.identifier_value;
        END IF;

        INSERT INTO public.sale_item_imeis (sale_item_id, imei, inventory_unit_id)
        VALUES (v_sale_item_id, v_inventory_unit.identifier_value, v_inventory_unit.id);

        UPDATE public.inventory_units
        SET status = 'sold', sale_id = v_sale_id, sale_item_id = v_sale_item_id,
            sold_at = now(), returned_at = null, updated_by = auth.uid()
        WHERE id = v_inventory_unit.id;

        INSERT INTO public.inventory_unit_events (
          inventory_unit_id, event_type, from_status, to_status,
          related_table, related_id, notes, payload
        ) VALUES (
          v_inventory_unit.id, 'sale_created', 'available', 'sold',
          'sales', v_sale_id, null,
          jsonb_build_object('sale_item_id', v_sale_item_id, 'customer_id', p_customer_id)
        );
      END LOOP;
    END IF;

    IF (item ->> 'is_gift')::boolean IS DISTINCT FROM TRUE THEN
      UPDATE public.product_variants
      SET stock = stock - v_quantity, updated_at = now()
      WHERE id = v_variant_id;
    END IF;
  END LOOP;

  UPDATE public.product_variants
  SET stock = coalesce(stock, 0) + 1,
      cost_price_usd = v_cost_price_usd,
      updated_at = now()
  WHERE id = p_received_variant_id;

  IF v_tracking_mode = 'serial' THEN
    IF p_imei IS NULL OR trim(p_imei) = '' THEN
      RAISE EXCEPTION 'La variante recibida es serializada y requiere IMEI/SN';
    END IF;

    INSERT INTO public.inventory_units (
      variant_id, identifier_value, status, received_at, notes, sale_id, updated_by
    ) VALUES (
      p_received_variant_id, trim(p_imei), 'available',
      v_received_at, 'Ingreso por plan canje', v_sale_id, auth.uid()
    );

    INSERT INTO public.inventory_unit_events (
      inventory_unit_id, event_type, from_status, to_status,
      related_table, related_id, notes
    )
    SELECT iu.id, 'canje_received', null, 'available', 'sales', v_sale_id,
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

GRANT EXECUTE ON FUNCTION public.create_canje_sale(
  integer, uuid, integer, integer, numeric, text, numeric, text, jsonb, text
) TO authenticated;
