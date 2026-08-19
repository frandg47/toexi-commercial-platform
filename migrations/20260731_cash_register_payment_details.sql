-- ===========================================================
-- Migración: Extender cash_register_movements con metadata de pago
-- y actualizar RPCs de cierre para conciliación por categoría
-- ===========================================================

-- 1. Agregar columnas de metadata de pago
ALTER TABLE public.cash_register_movements
  ADD COLUMN IF NOT EXISTS payment_method_id integer,
  ADD COLUMN IF NOT EXISTS payment_method_name text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS multiplier numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS accreditation_status text DEFAULT 'credited'
    CHECK (accreditation_status IN ('credited', 'pending')),
  ADD COLUMN IF NOT EXISTS available_on date,
  ADD COLUMN IF NOT EXISTS sale_payment_id bigint;

-- ===========================================================
-- 2. Nueva RPC: register_cash_movement_v2 (con metadata de pago)
-- ===========================================================
CREATE OR REPLACE FUNCTION public.register_cash_movement_v2(
  p_register_id bigint,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_notes text DEFAULT NULL,
  p_related_table text DEFAULT NULL,
  p_related_id bigint DEFAULT NULL,
  p_payment_method_id integer DEFAULT NULL,
  p_payment_method_name text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_multiplier numeric DEFAULT 1,
  p_net_amount numeric DEFAULT NULL,
  p_accreditation_status text DEFAULT 'credited',
  p_available_on date DEFAULT NULL,
  p_sale_payment_id bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_register_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;

  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, notes,
    related_table, related_id, created_by,
    payment_method_id, payment_method_name, reference,
    multiplier, net_amount, accreditation_status, available_on,
    sale_payment_id
  ) VALUES (
    p_register_id, p_type, p_amount, p_currency, p_notes,
    p_related_table, p_related_id, auth.uid(),
    p_payment_method_id, p_payment_method_name, p_reference,
    p_multiplier, COALESCE(p_net_amount, p_amount),
    p_accreditation_status, p_available_on,
    p_sale_payment_id
  );
END;
$$;

-- ===========================================================
-- 3. Actualizar close_cash_register para calcular por categoría
-- y retornar resumen JSON
-- ===========================================================
DROP FUNCTION IF EXISTS public.close_cash_register(bigint, jsonb, text);

CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_register_id bigint,
  p_closed_amounts jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_currency text;
  v_expected numeric;
  v_closed numeric;
  v_total_expected numeric := 0;
  v_total_closed numeric := 0;
  v_cash_expected numeric := 0;
  v_transfer_expected numeric := 0;
  v_transfer_count integer := 0;
  v_card_expected numeric := 0;
  v_card_count integer := 0;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_register_id
      AND user_id = v_user_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Caja no encontrada o ya cerrada';
  END IF;

  -- Calcular saldo esperado por moneda (misma lógica que antes)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_closed_amounts)
  LOOP
    v_currency := v_item->>'currency';

    SELECT COALESCE(
      (SELECT SUM(
        CASE
          WHEN type IN ('opening', 'sale_income', 'income', 'transfer_in') THEN amount
          WHEN type IN ('expense', 'withdrawal', 'transfer_out') THEN -amount
          ELSE 0
        END
      ) FROM public.cash_register_movements
      WHERE cash_register_id = p_register_id
        AND currency = v_currency),
    0) INTO v_expected;

    v_closed := (v_item->>'amount')::numeric;
    v_total_expected := v_total_expected + v_expected;
    v_total_closed := v_total_closed + v_closed;
  END LOOP;

  -- Calcular saldo por categoría de pago (solo moneda ARS para simplificar)
  -- Efectivo: movimientos sin payment_method_id o con nombre 'efectivo'
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('opening', 'sale_income', 'income', 'transfer_in') THEN amount
      WHEN type IN ('expense', 'withdrawal', 'transfer_out') THEN -amount
      ELSE 0
    END
  ), 0) INTO v_cash_expected
  FROM public.cash_register_movements
  WHERE cash_register_id = p_register_id
    AND currency = 'ARS'
    AND (payment_method_id IS NULL OR payment_method_name ILIKE '%efectivo%');

  -- Transferencias
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_transfer_expected, v_transfer_count
  FROM public.cash_register_movements
  WHERE cash_register_id = p_register_id
    AND type IN ('sale_income', 'income')
    AND payment_method_name ILIKE '%transfer%';

  -- Tarjetas (neto = amount / multiplier)
  SELECT COALESCE(SUM(COALESCE(net_amount, amount)), 0), COUNT(*)
  INTO v_card_expected, v_card_count
  FROM public.cash_register_movements
  WHERE cash_register_id = p_register_id
    AND type IN ('sale_income', 'income')
    AND (payment_method_name ILIKE '%tarjeta%' OR payment_method_name ILIKE '%card%');

  -- Cerrar caja
  UPDATE public.cash_registers
  SET status = 'closed',
      closed_amounts = p_closed_amounts,
      expected_amount = v_total_expected,
      difference = v_total_closed - v_total_expected,
      closed_at = now(),
      notes = COALESCE(p_notes, notes)
  WHERE id = p_register_id;

  -- Registrar movimiento de cierre por cada moneda
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_closed_amounts)
  LOOP
    IF (v_item->>'amount')::numeric > 0 THEN
      INSERT INTO public.cash_register_movements (
        cash_register_id, type, amount, currency, notes, created_by
      ) VALUES (
        p_register_id, 'closing',
        (v_item->>'amount')::numeric,
        v_item->>'currency',
        'Cierre de caja',
        v_user_id
      );
    END IF;
  END LOOP;

  -- Retornar resumen
  v_result := jsonb_build_object(
    'cash_expected', v_cash_expected,
    'transfer_expected', v_transfer_expected,
    'transfer_count', v_transfer_count,
    'card_expected', v_card_expected,
    'card_count', v_card_count,
    'total_expected', v_total_expected,
    'total_closed', v_total_closed,
    'difference', v_total_closed - v_total_expected
  );
  RETURN v_result;
END;
$$;
