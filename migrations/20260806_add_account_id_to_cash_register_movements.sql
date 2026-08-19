-- Agregar account_id a cash_register_movements para tracking preciso por cuenta
ALTER TABLE public.cash_register_movements
ADD COLUMN IF NOT EXISTS account_id bigint REFERENCES public.accounts(id);

CREATE INDEX IF NOT EXISTS idx_cash_register_movements_account_id 
ON public.cash_register_movements(account_id);
