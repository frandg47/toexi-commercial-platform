-- ===========================================================
-- Fix: open_cash_register valida cajas abiertas de otros días
-- Migración: 20260805_fix_open_register_stale_check.sql
-- ===========================================================

CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_amounts jsonb
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
  v_stale_date date;
BEGIN
  -- Verificar que no haya caja abierta de OTRO día (pendiente de cierre)
  SELECT register_date INTO v_stale_date
  FROM public.cash_registers
  WHERE user_id = v_user_id
    AND register_date != v_today
    AND status = 'open'
  ORDER BY register_date DESC
  LIMIT 1;

  IF v_stale_date IS NOT NULL THEN
    RAISE EXCEPTION 'Tenés una caja abierta del % que todavía no fue cerrada. Cerrala antes de abrir una nueva.', v_stale_date;
  END IF;

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
