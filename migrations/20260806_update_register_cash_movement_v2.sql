-- Actualizar register_cash_movement_v2 para aceptar account_id
-- Primero eliminar la versión vieja (sin p_account_id) para evitar conflicto de sobrecarga
DROP FUNCTION IF EXISTS public.register_cash_movement_v2(
  bigint, text, numeric, text, text, text, bigint, integer, text, text, numeric, numeric, text, date, bigint
);

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
  p_sale_payment_id bigint DEFAULT NULL,
  p_account_id bigint DEFAULT NULL
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
    sale_payment_id, account_id
  ) VALUES (
    p_register_id, p_type, p_amount, p_currency, p_notes,
    p_related_table, p_related_id, auth.uid(),
    p_payment_method_id, p_payment_method_name, p_reference,
    p_multiplier, COALESCE(p_net_amount, p_amount),
    p_accreditation_status, p_available_on,
    p_sale_payment_id, p_account_id
  );
END;
$$;
