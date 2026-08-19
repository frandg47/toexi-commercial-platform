-- ===========================================================
-- Migración: Agregar flag is_caja_virtual a accounts
-- para identificar cuentas disponibles en caja diaria
-- ===========================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_caja_virtual boolean NOT NULL DEFAULT false;
