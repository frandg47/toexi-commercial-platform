-- ===========================================================
-- TEST SCRIPT: Caja Diaria - Ventas Pendientes
-- Ejecutar en Supabase SQL Editor
-- ===========================================================

-- PASO 1: Crear cliente de prueba
INSERT INTO public.customers (name, last_name, phone, email, notes)
VALUES ('Cliente', 'Test Caja', '+5491100000000', 'test.caja@example.com', 'Cliente de prueba para caja diaria')
ON CONFLICT DO NOTHING
RETURNING id, name, last_name;

-- Anotá el customer_id que te devuelva el paso anterior
-- y reemplazalo en los INSERT de abajo (en p_customer_id)

-- ===========================================================
-- PASO 2: Ver variantes disponibles (para elegir un variant_id)
-- ===========================================================
-- SELECT id, variant_name, usd_price, stock FROM public.product_variants WHERE stock > 0 LIMIT 5;

-- ===========================================================
-- PASO 3: Crear ventas pendientes de prueba
-- Reemplazá <CUSTOMER_ID> con el ID del paso 1
-- y <VARIANT_ID> con un variant_id válido de tu BD
-- ===========================================================

-- Venta pendiente #1: 1 producto
INSERT INTO public.sales (
  customer_id, seller_id, total_usd, total_ars, fx_rate_used,
  notes, status, sale_date, payments
) VALUES (
  <CUSTOMER_ID>,   -- ← reemplazar
  NULL,            -- seller_id (opcional)
  150.00,          -- total_usd
  150000,          -- total_ars (150 USD * 1000 ARS/USD)
  1000,            -- fx_rate_used
  'Venta de prueba #1 - pendiente de cobro',
  'pending',
  now(),
  '[]'::jsonb
)
RETURNING id;

-- Anotá el sale_id que devuelva y reemplazalo en el INSERT de sale_items

-- Items de la venta #1
INSERT INTO public.sale_items (
  sale_id, variant_id, product_name, variant_name,
  color, usd_price, quantity, subtotal_usd, subtotal_ars
) VALUES (
  <SALE_ID>,       -- ← reemplazar con el id del paso anterior
  <VARIANT_ID>,    -- ← reemplazar con un variant_id válido
  'iPhone 15',     -- nombre del producto
  '128GB Negro',   -- nombre de la variante
  'Negro',
  150.00,          -- usd_price
  1,               -- quantity
  150.00,          -- subtotal_usd
  150000           -- subtotal_ars
);

-- Venta pendiente #2: otra venta
INSERT INTO public.sales (
  customer_id, seller_id, total_usd, total_ars, fx_rate_used,
  notes, status, sale_date, payments
) VALUES (
  <CUSTOMER_ID>,   -- ← reemplazar
  NULL,
  200.00,
  200000,
  1000,
  'Venta de prueba #2 - pendiente de cobro',
  'pending',
  now(),
  '[]'::jsonb
)
RETURNING id;

-- Items de la venta #2
INSERT INTO public.sale_items (
  sale_id, variant_id, product_name, variant_name,
  color, usd_price, quantity, subtotal_usd, subtotal_ars
) VALUES (
  <SALE_ID_2>,     -- ← reemplazar
  <VARIANT_ID>,    -- ← reemplazar
  'Samsung Galaxy S24',
  '256GB Blanco',
  'Blanco',
  200.00,
  1,
  200.00,
  200000
);

-- ===========================================================
-- VERIFICACIÓN: Ver las ventas pendientes creadas
-- ===========================================================
SELECT s.id, s.status, s.total_ars, s.notes, s.sale_date,
       c.name || ' ' || c.last_name as customer_name
FROM public.sales s
LEFT JOIN public.customers c ON c.id = s.customer_id
WHERE s.status = 'pending'
ORDER BY s.sale_date DESC;

-- ===========================================================
-- LIMPIEZA: Eliminar datos de prueba (ejecutar al finalizar)
-- ===========================================================
-- DELETE FROM public.sale_items WHERE sale_id IN (
--   SELECT id FROM public.sales WHERE notes LIKE '%prueba%caja%'
-- );
-- DELETE FROM public.sales WHERE notes LIKE '%prueba%caja%';
-- DELETE FROM public.customers WHERE email = 'test.caja@example.com';
