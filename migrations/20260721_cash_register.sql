-- ===========================================================
-- CAJA DIARIA POR USUARIO
-- Migración: 20260721_cash_register.sql
-- ===========================================================

-- Tabla principal: una caja por usuario por día
CREATE TABLE public.cash_registers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  register_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  currency text NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD', 'USDT')),
  opening_amount numeric NOT NULL DEFAULT 0,
  closed_amount numeric,
  expected_amount numeric,
  difference numeric,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  distribution jsonb,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cash_registers_pkey PRIMARY KEY (id),
  CONSTRAINT cash_registers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT cash_registers_user_date_unique UNIQUE (user_id, register_date)
);

-- Tabla de movimientos individuales de la caja
CREATE TABLE public.cash_register_movements (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  cash_register_id bigint NOT NULL,
  type text NOT NULL CHECK (type IN (
    'opening', 'sale_income', 'expense', 'withdrawal',
    'income', 'transfer_in', 'transfer_out', 'closing'
  )),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  related_table text,
  related_id bigint,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT cash_register_movements_pkey PRIMARY KEY (id),
  CONSTRAINT cash_register_movements_register_fkey FOREIGN KEY (cash_register_id)
    REFERENCES public.cash_registers(id) ON DELETE CASCADE
);

-- ===========================================================
-- RLS
-- ===========================================================
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_movements ENABLE ROW LEVEL SECURITY;

-- Policies: owner y superadmin ven todo
CREATE POLICY "cash_registers_select_admin"
  ON public.cash_registers FOR SELECT TO authenticated
  USING (public.is_admin_like());

CREATE POLICY "cash_registers_insert_admin"
  ON public.cash_registers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_like());

CREATE POLICY "cash_registers_update_admin"
  ON public.cash_registers FOR UPDATE TO authenticated
  USING (public.is_admin_like())
  WITH CHECK (public.is_admin_like());

CREATE POLICY "cash_movements_select_admin"
  ON public.cash_register_movements FOR SELECT TO authenticated
  USING (public.is_admin_like());

CREATE POLICY "cash_movements_insert_admin"
  ON public.cash_register_movements FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_like());

-- ===========================================================
-- RPC: Abrir caja
-- ===========================================================
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_amount numeric,
  p_currency text DEFAULT 'ARS'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_register_id bigint;
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

  INSERT INTO public.cash_registers (user_id, register_date, status, currency, opening_amount)
  VALUES (v_user_id, v_today, 'open', p_currency, p_amount)
  RETURNING id INTO v_register_id;

  -- Registrar movimiento de apertura
  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, notes, created_by
  ) VALUES (
    v_register_id, 'opening', p_amount, p_currency, 'Apertura de caja', v_user_id
  );

  RETURN v_register_id;
END;
$$;

-- ===========================================================
-- RPC: Cerrar caja
-- ===========================================================
CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_register_id bigint,
  p_counted_cash numeric,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expected numeric;
  v_user_id uuid := auth.uid();
  v_currency text;
BEGIN
  -- Verificar que la caja pertenece al usuario y está abierta
  SELECT currency INTO v_currency
  FROM public.cash_registers
  WHERE id = p_register_id
    AND user_id = v_user_id
    AND status = 'open';

  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'Caja no encontrada o ya cerrada';
  END IF;

  -- Calcular saldo esperado (apertura + ingresos - egresos)
  SELECT COALESCE(
    (SELECT SUM(
      CASE
        WHEN type IN ('opening', 'sale_income', 'income', 'transfer_in') THEN amount
        WHEN type IN ('expense', 'withdrawal', 'transfer_out') THEN -amount
        ELSE 0
      END
    ) FROM public.cash_register_movements
    WHERE cash_register_id = p_register_id),
  0) INTO v_expected;

  -- Cerrar caja
  UPDATE public.cash_registers
  SET status = 'closed',
      closed_amount = p_counted_cash,
      expected_amount = v_expected,
      difference = p_counted_cash - v_expected,
      closed_at = now(),
      notes = COALESCE(p_notes, notes)
  WHERE id = p_register_id;

  -- Registrar movimiento de cierre
  INSERT INTO public.cash_register_movements (
    cash_register_id, type, amount, currency, notes, created_by
  ) VALUES (
    p_register_id, 'closing', p_counted_cash, v_currency, 'Cierre de caja', v_user_id
  );
END;
$$;

-- ===========================================================
-- RPC: Registrar movimiento de venta en caja
-- ===========================================================
CREATE OR REPLACE FUNCTION public.register_sale_in_cash_register(
  p_register_id bigint,
  p_amount numeric,
  p_currency text,
  p_sale_id bigint
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
    cash_register_id, type, amount, currency, related_table, related_id, created_by
  ) VALUES (
    p_register_id, 'sale_income', p_amount, p_currency, 'sales', p_sale_id, auth.uid()
  );
END;
$$;

-- ===========================================================
-- RPC: Registrar retiro/gasto de caja
-- ===========================================================
CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_register_id bigint,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_notes text DEFAULT NULL,
  p_related_table text DEFAULT NULL,
  p_related_id bigint DEFAULT NULL
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
    cash_register_id, type, amount, currency, related_table, related_id, notes, created_by
  ) VALUES (
    p_register_id, p_type, p_amount, p_currency, p_related_table, p_related_id, p_notes, auth.uid()
  );
END;
$$;

-- ===========================================================
-- RPC: Distribuir fondos post-cierre a cuentas existentes
-- ===========================================================
CREATE OR REPLACE FUNCTION public.distribute_cash_register(
  p_register_id bigint,
  p_distributions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dist jsonb;
  v_user_id uuid := auth.uid();
BEGIN
  -- Verificar que la caja esté cerrada y pertenezca al usuario
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = p_register_id
      AND user_id = v_user_id
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Caja no encontrada o no está cerrada';
  END IF;

  -- Guardar distribución en la caja
  UPDATE public.cash_registers
  SET distribution = p_distributions
  WHERE id = p_register_id;

  -- Crear movimientos en account_movements
  FOR v_dist IN SELECT * FROM jsonb_array_elements(p_distributions)
  LOOP
    INSERT INTO public.account_movements (
      movement_date, account_id, type, amount, currency,
      related_table, related_id, notes
    ) VALUES (
      CURRENT_DATE,
      (v_dist->>'account_id')::bigint,
      'income',
      (v_dist->>'amount')::numeric,
      v_dist->>'currency',
      'cash_register',
      p_register_id,
      'Distribución desde caja diaria'
    );
  END LOOP;
END;
$$;
