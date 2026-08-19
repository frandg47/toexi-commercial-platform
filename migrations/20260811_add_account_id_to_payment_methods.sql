-- ===========================================================
-- Migracion: Agregar account_id a payment_methods
-- para que cada metodo de pago apunte a su cuenta destino.
-- El trigger trg_sale_payments_movement crea automáticamente
-- los account_movements cuando sale_payments tiene account_id.
-- ===========================================================

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS account_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_methods_account_id_fkey'
  ) THEN
    ALTER TABLE public.payment_methods
      ADD CONSTRAINT payment_methods_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.accounts(id);
  END IF;
END $$;
