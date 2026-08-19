-- ===========================================================
-- Migracion: ajuste contable atomico al abrir caja
-- El ajuste se realiza antes de registrar la apertura de caja,
-- sin requerir que exista una caja abierta previamente.
-- ===========================================================

ALTER TABLE public.account_movements
  DROP CONSTRAINT IF EXISTS account_movements_currency_check;

ALTER TABLE public.account_movements
  ADD CONSTRAINT account_movements_currency_check
  CHECK (currency IN ('ARS', 'USD', 'USDT'));

DROP FUNCTION IF EXISTS public.open_cash_register(jsonb);

CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_amounts jsonb,
  p_adjustments jsonb DEFAULT '[]'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_register_id bigint;
  v_item jsonb;
  v_account_id bigint;
  v_currency text;
  v_counted numeric;
  v_current numeric;
  v_adjustment numeric;
  v_account_currency text;
BEGIN
  -- Verificar que no haya una caja abierta de otro dia.
  IF EXISTS (
    SELECT 1
    FROM public.cash_registers
    WHERE user_id = v_user_id
      AND register_date <> v_today
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Tenes una caja abierta de otro dia. Cerrala antes de abrir una nueva.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_registers
    WHERE user_id = v_user_id
      AND register_date = v_today
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Ya existe una caja abierta para hoy';
  END IF;

  -- Crear primero la caja para poder vincularle los ajustes.
  INSERT INTO public.cash_registers (user_id, register_date, status, opening_amounts)
  VALUES (v_user_id, v_today, 'open', p_amounts)
  RETURNING id INTO v_register_id;

  -- Reconciliar cada cuenta de efectivo con el monto fisico contado.
  -- El saldo actual se calcula dentro de la RPC para no confiar en el cliente.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_adjustments, '[]'::jsonb))
  LOOP
    v_account_id := (v_item->>'account_id')::bigint;
    v_currency := v_item->>'currency';
    v_counted := (v_item->>'counted')::numeric;

    SELECT currency
      INTO v_account_currency
      FROM public.accounts
     WHERE id = v_account_id
       AND is_efectivo = true
     FOR UPDATE;

    IF v_account_currency IS NULL THEN
      RAISE EXCEPTION 'La cuenta de ajuste no es una cuenta de efectivo valida';
    END IF;

    IF v_account_currency <> v_currency THEN
      RAISE EXCEPTION 'La moneda del ajuste no coincide con la cuenta de efectivo';
    END IF;

    SELECT
      COALESCE(a.initial_balance, 0) + COALESCE(SUM(
        CASE
          WHEN am.type = 'income' THEN am.amount
          WHEN am.type = 'expense' THEN -am.amount
          ELSE 0
        END
      ), 0)
      INTO v_current
      FROM public.accounts a
      LEFT JOIN public.account_movements am ON am.account_id = a.id
     WHERE a.id = v_account_id
     GROUP BY a.id, a.initial_balance;

    v_adjustment := v_counted - COALESCE(v_current, 0);

    IF ABS(v_adjustment) > 0.0001 THEN
      INSERT INTO public.account_movements (
        movement_date,
        account_id,
        type,
        amount,
        currency,
        related_table,
        related_id,
        notes
      ) VALUES (
        v_today,
        v_account_id,
        CASE WHEN v_adjustment > 0 THEN 'income' ELSE 'expense' END,
        ABS(v_adjustment),
        v_currency,
        'cash_register_opening_adjustment',
        v_register_id,
        'Ajuste de apertura de caja'
      );
    END IF;
  END LOOP;

  -- Registrar la apertura solo como movimiento de caja.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_amounts)
  LOOP
    IF (v_item->>'amount')::numeric > 0 THEN
      INSERT INTO public.cash_register_movements (
        cash_register_id, type, amount, currency, notes, created_by
      ) VALUES (
        v_register_id,
        'opening',
        (v_item->>'amount')::numeric,
        v_item->>'currency',
        'Apertura de caja',
        v_user_id
      );
    END IF;
  END LOOP;

  RETURN v_register_id;
END;
$$;
