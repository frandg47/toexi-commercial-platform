-- ===========================================================
-- Identificador comun para agrupar las puntas de una operacion
-- ===========================================================

ALTER TABLE public.account_movements
  ADD COLUMN IF NOT EXISTS operation_id uuid;

ALTER TABLE public.cash_register_movements
  ADD COLUMN IF NOT EXISTS operation_id uuid;

CREATE INDEX IF NOT EXISTS account_movements_operation_id_idx
  ON public.account_movements(operation_id);

CREATE INDEX IF NOT EXISTS cash_register_movements_operation_id_idx
  ON public.cash_register_movements(operation_id);

DROP FUNCTION IF EXISTS public.register_cash_movement(
  bigint, text, numeric, text, text, text, bigint, bigint
);

CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_register_id bigint,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_notes text DEFAULT NULL,
  p_related_table text DEFAULT NULL,
  p_related_id bigint DEFAULT NULL,
  p_account_id bigint DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL
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
    RAISE EXCEPTION 'La caja no esta abierta';
  END IF;

  IF p_type NOT IN ('expense', 'withdrawal', 'income', 'transfer_in', 'transfer_out') THEN
    RAISE EXCEPTION 'Tipo de movimiento invalido';
  END IF;

  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, related_table, related_id,
    notes, created_by, account_id, operation_id
  ) VALUES (
    p_register_id, p_type, p_amount, p_currency, p_related_table, p_related_id,
    p_notes, auth.uid(), p_account_id, p_operation_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.register_cash_movement_v2(
  bigint, text, numeric, text, text, text, bigint, integer, text, text,
  numeric, numeric, text, date, bigint, bigint
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
  p_account_id bigint DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL
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
    RAISE EXCEPTION 'La caja no esta abierta';
  END IF;

  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, notes,
    related_table, related_id, created_by,
    payment_method_id, payment_method_name, reference,
    multiplier, net_amount, accreditation_status, available_on,
    sale_payment_id, account_id, operation_id
  ) VALUES (
    p_register_id, p_type, p_amount, p_currency, p_notes,
    p_related_table, p_related_id, auth.uid(),
    p_payment_method_id, p_payment_method_name, p_reference,
    p_multiplier, COALESCE(p_net_amount, p_amount),
    p_accreditation_status, p_available_on,
    p_sale_payment_id, p_account_id, p_operation_id
  );
END;
$$;
