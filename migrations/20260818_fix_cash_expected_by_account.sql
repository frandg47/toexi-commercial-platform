-- ===========================================================
-- Fix: calcular efectivo esperado por cuenta efectiva
-- Las cuentas virtuales y tarjetas no afectan el efectivo fisico.
-- ===========================================================

DROP FUNCTION IF EXISTS public.close_cash_register(bigint, jsonb, text);

CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_register_id bigint,
  p_closed_amounts jsonb,
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
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_register_id
      AND user_id = v_user_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Caja no encontrada o ya cerrada';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_closed_amounts)
  LOOP
    v_currency := v_item->>'currency';

    SELECT COALESCE(SUM(
      CASE
        WHEN crm.type IN ('opening', 'sale_income', 'income', 'transfer_in') THEN crm.amount
        WHEN crm.type IN ('expense', 'withdrawal', 'transfer_out') THEN -crm.amount
        ELSE 0
      END
    ), 0)
    INTO v_expected
    FROM public.cash_register_movements crm
    LEFT JOIN public.accounts acc ON acc.id = crm.account_id
    WHERE crm.cash_register_id = p_register_id
      AND crm.currency = v_currency
      AND (
        crm.type = 'opening'
        OR acc.is_efectivo = true
        OR (
          crm.account_id IS NULL
          AND (
            crm.type = 'transfer_out'
            OR (
              crm.type <> 'transfer_in'
              AND lower(coalesce(crm.payment_method_name, '')) NOT LIKE '%transfer%'
              AND lower(coalesce(crm.payment_method_name, '')) NOT LIKE '%tarjeta%'
              AND lower(coalesce(crm.payment_method_name, '')) NOT LIKE '%card%'
            )
          )
        )
      );

    v_closed := (v_item->>'amount')::numeric;
    v_total_expected := v_total_expected + v_expected;
    v_total_closed := v_total_closed + v_closed;

    v_diffs := v_diffs || jsonb_build_object(
      'currency', v_currency,
      'expected', v_expected,
      'counted', v_closed,
      'difference', v_closed - v_expected
    );
  END LOOP;

  UPDATE public.cash_registers
  SET status = 'closed',
      closed_amounts = p_closed_amounts,
      expected_amount = v_total_expected,
      difference = v_total_closed - v_total_expected,
      difference_per_currency = v_diffs,
      closed_at = now(),
      notes = COALESCE(p_notes, notes)
  WHERE id = p_register_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_closed_amounts)
  LOOP
    IF (v_item->>'amount')::numeric > 0 THEN
      INSERT INTO public.cash_register_movements (
        cash_register_id, type, amount, currency, notes, created_by
      ) VALUES (
        p_register_id,
        'closing',
        (v_item->>'amount')::numeric,
        v_item->>'currency',
        'Cierre de caja',
        v_user_id
      );
    END IF;
  END LOOP;
END;
$$;
