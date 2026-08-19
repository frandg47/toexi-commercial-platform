-- ===========================================================
-- CAJA DIARIA — MULTIDIVISA + STATUS SALES
-- Migración: 20260722_cash_register_multicurrency.sql
-- ===========================================================

-- 1. Agregar status a sales (para ventas pendientes/pago)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.sales
      ADD COLUMN status text NOT NULL DEFAULT 'vendido'
      CHECK (status IN ('pending', 'vendido', 'anulado'));
  END IF;
END $$;

-- 2. Modificar cash_registers: soporte multidivisa
-- Agregar opening_amounts jsonb para múltiples monedas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_registers' AND column_name = 'opening_amounts'
  ) THEN
    ALTER TABLE public.cash_registers
      ADD COLUMN opening_amounts jsonb NOT NULL DEFAULT '[{"currency":"ARS","amount":0}]'::jsonb;
  END IF;
END $$;

-- ===========================================================
-- RPC: Abrir caja (multidivisa)
-- ===========================================================
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_amounts jsonb  -- [{"currency":"ARS","amount":120000},{"currency":"USD","amount":0}]
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
BEGIN
  -- Verificar que no haya caja abierta hoy
  IF EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE user_id = v_user_id
      AND register_date = v_today
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Ya existe una caja abierta para hoy';
  END IF;

  -- Crear la caja con montos multidivisa
  INSERT INTO public.cash_registers (user_id, register_date, status, opening_amounts)
  VALUES (v_user_id, v_today, 'open', p_amounts)
  RETURNING id INTO v_register_id;

  -- Registrar movimientos de apertura por cada moneda
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_amounts)
  LOOP
    IF (v_item->>'amount')::numeric > 0 THEN
      INSERT INTO public.cash_register_movements (
        cash_register_id, type, amount, currency, notes, created_by
      ) VALUES (
        v_register_id, 'opening',
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

-- ===========================================================
-- RPC: Cerrar caja (multidivisa)
-- ===========================================================
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

  -- Calcular saldo esperado por moneda
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

    -- Guardar closing_amounts con diferencia por moneda
    v_total_expected := v_total_expected + v_expected;
    v_total_closed := v_total_closed + v_closed;
  END LOOP;

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
END;
$$;

-- ===========================================================
-- RPC: Cobrar venta pendiente desde caja
-- ===========================================================
CREATE OR REPLACE FUNCTION public.collect_pending_sale(
  p_sale_id bigint,
  p_payment_method_id integer,
  p_amount numeric,
  p_amount_ars numeric,
  p_account_id bigint,
  p_cash_register_id bigint,
  p_fx_rate numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_status text;
  v_currency text;
BEGIN
  -- Verificar que la venta existe y está pendiente
  SELECT status INTO v_sale_status
  FROM public.sales
  WHERE id = p_sale_id;

  IF v_sale_status IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale_status != 'pending' THEN
    RAISE EXCEPTION 'La venta no está pendiente de cobro';
  END IF;

  -- Verificar que la caja está abierta
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_cash_register_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;

  -- Obtener moneda del método de pago
  SELECT CASE
    WHEN pm.name ILIKE '%usd%' THEN 'USD'
    WHEN pm.name ILIKE '%usdt%' THEN 'USDT'
    ELSE 'ARS'
  END INTO v_currency
  FROM public.payment_methods pm
  WHERE pm.id = p_payment_method_id;

  -- Registrar pago en sale_payments
  INSERT INTO public.sale_payments (
    sale_id, method, amount_ars, amount_usd, payment_method_id, account_id
  ) VALUES (
    p_sale_id,
    CASE WHEN v_currency = 'ARS' THEN 'efectivo' ELSE 'transferencia' END,
    p_amount_ars,
    CASE WHEN v_currency IN ('USD', 'USDT') THEN p_amount ELSE NULL END,
    p_payment_method_id,
    p_account_id
  );

  -- Registrar movimiento en caja
  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, related_table, related_id, notes, created_by
  ) VALUES (
    p_cash_register_id, 'sale_income', p_amount_ars, 'ARS',
    'sales', p_sale_id,
    'Cobro de venta pendiente #' || p_sale_id,
    auth.uid()
  );

  -- Marcar venta como pagada
  UPDATE public.sales
  SET status = 'vendido',
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = p_sale_id;
END;
$$;

-- Agregar closed_amounts si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_registers' AND column_name = 'closed_amounts'
  ) THEN
    ALTER TABLE public.cash_registers
      ADD COLUMN closed_amounts jsonb;
  END IF;
END $$;
