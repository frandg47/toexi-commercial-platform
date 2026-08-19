-- ===========================================================
-- Migracion: Diferencia por moneda en cierre de caja
-- 1) Agregar columna difference_per_currency jsonb
-- 2) Actualizar close_cash_register para guardar
--    [{currency, expected, counted, difference}] por moneda
-- ===========================================================

ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS difference_per_currency jsonb;

DROP FUNCTION IF EXISTS public.close_cash_register(bigint, jsonb, text);

CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_register_id bigint,
  p_closed_amounts jsonb,  -- [{"currency":"ARS","amount":125000},{"currency":"USD","amount":100}]
  p_notes text DEFAULT NULL
)
RETURNS void
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
  v_diffs jsonb := '[]'::jsonb;
BEGIN
  -- Verificar que la caja pertenece al usuario y está abierta
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_register_id
      AND user_id = v_user_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Caja no encontrada o ya cerrada';
  END IF;

  -- Calcular saldo esperado por moneda y acumular diferencias
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_closed_amounts)
  LOOP
    v_currency := v_item->>'currency';

    -- Calcular esperado para esta moneda
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

    -- Acumular diferencia por moneda
    v_total_expected := v_total_expected + v_expected;
    v_total_closed := v_total_closed + v_closed;

    v_diffs := v_diffs || jsonb_build_object(
      'currency', v_currency,
      'expected', v_expected,
      'counted', v_closed,
      'difference', v_closed - v_expected
    );
  END LOOP;

  -- Cerrar caja
  UPDATE public.cash_registers
  SET status = 'closed',
      closed_amounts = p_closed_amounts,
      expected_amount = v_total_expected,
      difference = v_total_closed - v_total_expected,
      difference_per_currency = v_diffs,
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
END;
$$;
