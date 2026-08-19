-- Actualizar register_cash_movement para aceptar account_id
CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_register_id bigint,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_notes text DEFAULT NULL,
  p_related_table text DEFAULT NULL,
  p_related_id bigint DEFAULT NULL,
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

  IF p_type NOT IN ('expense', 'withdrawal', 'income', 'transfer_in', 'transfer_out') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido';
  END IF;

  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, related_table, related_id, notes, created_by, account_id
  ) VALUES (
    p_register_id, p_type, p_amount, p_currency, p_related_table, p_related_id, p_notes, auth.uid(), p_account_id
  );
END;
$$;
