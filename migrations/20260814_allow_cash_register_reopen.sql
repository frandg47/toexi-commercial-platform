-- ===========================================================
-- Migracion: permitir reabrir caja conservando el historial
-- Se permiten varias sesiones cerradas por usuario y fecha,
-- pero solo una sesion abierta por usuario y fecha.
-- ===========================================================

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_user_date_unique;

CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_user_date_open_unique
  ON public.cash_registers (user_id, register_date)
  WHERE status = 'open';
