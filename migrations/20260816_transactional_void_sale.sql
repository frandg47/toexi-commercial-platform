-- ===========================================================
-- Anulacion transaccional de ventas cobradas
-- Revierte stock, cuentas y caja en una sola operacion.
-- ===========================================================

DROP FUNCTION IF EXISTS public.void_sale(bigint, text, text);
DROP FUNCTION IF EXISTS public.void_sale(bigint, text, text, boolean);

CREATE OR REPLACE FUNCTION public.void_sale(
  p_sale_id bigint,
  p_reason text,
  p_bucket text DEFAULT 'available',
  p_delete_canje_unit boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_items_count integer;
  v_serial_units_count integer;
  v_target_status text;
  item_row record;
  payment_row record;
  movement_row public.account_movements%rowtype;
  cash_row record;
  v_has_movement boolean;
  v_amount numeric;
  v_currency text;
  v_amount_ars numeric;
BEGIN
  IF NOT public.is_owner_or_superadmin() THEN
    RAISE EXCEPTION 'Solo owner o superadmin puede anular ventas';
  END IF;

  IF p_bucket NOT IN ('available', 'defective') THEN
    RAISE EXCEPTION 'Bucket invalido. Use available o defective';
  END IF;

  PERFORM 1 FROM public.sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sales WHERE id = p_sale_id AND status = 'anulado') THEN
    RAISE EXCEPTION 'La venta % ya esta anulada', p_sale_id;
  END IF;

  SELECT count(*)
  INTO v_items_count
  FROM public.sale_items
  WHERE sale_id = p_sale_id
    AND variant_id IS NOT NULL
    AND coalesce(quantity, 0) > 0;

  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'Venta %: no hay items para reintegrar', p_sale_id;
  END IF;

  v_target_status := CASE WHEN p_bucket = 'available' THEN 'available' ELSE 'defective' END;

  -- Reintegrar stock y unidades serializadas.
  FOR item_row IN
    SELECT
      si.id,
      si.variant_id,
      coalesce(si.quantity, 0)::integer AS quantity,
      coalesce(p.inventory_tracking_mode, 'quantity') AS inventory_tracking_mode
    FROM public.sale_items si
    JOIN public.product_variants pv ON pv.id = si.variant_id
    JOIN public.products p ON p.id = pv.product_id
    WHERE si.sale_id = p_sale_id
      AND si.variant_id IS NOT NULL
      AND coalesce(si.quantity, 0) > 0
    FOR UPDATE OF si
  LOOP
    IF p_bucket = 'available' THEN
      UPDATE public.product_variants
      SET stock = stock + item_row.quantity, updated_at = now()
      WHERE id = item_row.variant_id;
    ELSE
      UPDATE public.product_variants
      SET stock_defective = stock_defective + item_row.quantity, updated_at = now()
      WHERE id = item_row.variant_id;
    END IF;

    IF item_row.inventory_tracking_mode = 'serial' THEN
      SELECT count(*)
      INTO v_serial_units_count
      FROM public.inventory_units
      WHERE sale_item_id = item_row.id;

      IF v_serial_units_count > 0 AND v_serial_units_count <> item_row.quantity THEN
        RAISE EXCEPTION 'Cantidad inconsistente de unidades serializadas para sale_item %', item_row.id;
      END IF;

      WITH moved_units AS (
        UPDATE public.inventory_units
        SET status = v_target_status,
            sale_id = NULL,
            sale_item_id = NULL,
            sold_at = NULL,
            returned_at = now(),
            updated_by = auth.uid()
        WHERE sale_item_id = item_row.id
        RETURNING id, identifier_value
      )
      INSERT INTO public.inventory_unit_events (
        inventory_unit_id, event_type, from_status, to_status,
        related_table, related_id, notes, payload
      )
      SELECT
        id, 'sale_voided', 'sold', v_target_status,
        'sales', p_sale_id, p_reason,
        jsonb_build_object('sale_item_id', item_row.id, 'bucket', p_bucket)
      FROM moved_units;
    END IF;
  END LOOP;

  -- Revertir cada pago en cuentas y conservar el historial del cobro.
  FOR payment_row IN
    SELECT id, sale_id, account_id, amount_ars, amount_usd
    FROM public.sale_payments
    WHERE sale_id = p_sale_id
    ORDER BY id
  LOOP
    IF payment_row.account_id IS NULL THEN
      CONTINUE;
    END IF;

    v_has_movement := false;
    SELECT *
    INTO movement_row
    FROM public.account_movements
    WHERE related_table = 'sale_payments'
      AND related_id = payment_row.id
    ORDER BY id DESC
    LIMIT 1;

    v_has_movement := FOUND;
    IF v_has_movement THEN
      v_amount := movement_row.amount;
      v_currency := movement_row.currency;
      v_amount_ars := movement_row.amount_ars;
    ELSE
      v_currency := CASE
        WHEN payment_row.amount_usd IS NOT NULL AND payment_row.amount_usd <> 0 THEN 'USD'
        ELSE 'ARS'
      END;
      v_amount := CASE
        WHEN v_currency = 'USD' THEN payment_row.amount_usd
        ELSE payment_row.amount_ars
      END;
      v_amount_ars := payment_row.amount_ars;
    END IF;

    INSERT INTO public.account_movements (
      movement_date, account_id, type, amount, currency, amount_ars,
      related_table, related_id, notes
    ) VALUES (
      current_date, payment_row.account_id, 'transfer', v_amount, v_currency, v_amount_ars,
      'sale_payment_history', payment_row.id,
      'Historial de cobro de venta #' || p_sale_id
    );

    INSERT INTO public.account_movements (
      movement_date, account_id, type, amount, currency, amount_ars,
      related_table, related_id, notes
    ) VALUES (
      current_date, payment_row.account_id, 'expense', v_amount, v_currency, v_amount_ars,
      'sale_reversal', payment_row.id,
      'Anulacion de venta #' || p_sale_id || CASE WHEN p_reason IS NOT NULL THEN ' | Motivo: ' || p_reason ELSE '' END
    );
  END LOOP;

  -- Revertir la caja solamente cuando la caja original sigue abierta.
  FOR cash_row IN
    SELECT crm.*
    FROM public.cash_register_movements crm
    JOIN public.cash_registers cr ON cr.id = crm.cash_register_id
    WHERE crm.related_table = 'sales'
      AND crm.related_id = p_sale_id
      AND crm.type = 'sale_income'
      AND cr.status = 'open'
  LOOP
    INSERT INTO public.cash_register_movements (
      cash_register_id, type, amount, currency, related_table, related_id,
      notes, created_by, payment_method_id, payment_method_name,
      reference, multiplier, net_amount, accreditation_status,
      available_on, sale_payment_id, account_id
    ) VALUES (
      cash_row.cash_register_id, 'expense', cash_row.amount, cash_row.currency,
      'cash_register_reversal', p_sale_id,
      'Anulacion de venta #' || p_sale_id || CASE WHEN p_reason IS NOT NULL THEN ' | Motivo: ' || p_reason ELSE '' END,
      auth.uid(), cash_row.payment_method_id, cash_row.payment_method_name,
      cash_row.reference, cash_row.multiplier, cash_row.net_amount,
      'credited', current_date, cash_row.sale_payment_id, cash_row.account_id
    );
  END LOOP;

  PERFORM public.revert_commission_for_sale(p_sale_id);

  UPDATE public.sales
  SET status = 'anulado',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = p_reason,
      void_stock_bucket = p_bucket
  WHERE id = p_sale_id;

  IF p_delete_canje_unit THEN
    DELETE FROM public.inventory_units
    WHERE sale_id = p_sale_id
      AND sale_item_id IS NULL
      AND notes ILIKE '%plan canje%';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_sale(bigint, text, text, boolean) TO authenticated;
