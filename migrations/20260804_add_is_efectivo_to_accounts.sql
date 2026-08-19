-- ===========================================================
-- Migración: Agregar flag is_efectivo a accounts
-- para identificar cuentas que representan efectivo físico en caja
-- ===========================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_efectivo boolean NOT NULL DEFAULT false;
