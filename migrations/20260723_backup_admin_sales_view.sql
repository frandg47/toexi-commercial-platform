-- BACKUP: admin_sales_view actual (antes de agregar customer_address)
-- Generado desde migrations/20260528_sale_items_is_gift.sql

drop view if exists public.admin_sales_view cascade;

create view public.admin_sales_view as
select
  s.id as sale_id,
  s.customer_id,
  s.seller_id,
  s.lead_id,
  s.total_usd,
  s.total_ars,
  s.discount_type,
  s.discount_value,
  s.discount_amount,
  s.fx_rate_used,
  s.notes,
  s.sale_date,
  s.status,
  s.voided_at,
  s.voided_by,
  s.void_reason,
  s.void_stock_bucket,
  s.sales_channel_id,
  s.updated_at,
  s.updated_by,
  sc.name as sales_channel_name,
  c.name as customer_name,
  c.last_name as customer_last_name,
  c.phone as customer_phone,
  u.name as seller_name,
  u.last_name as seller_last_name,
  u.email as seller_email,
  u.phone as seller_phone,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', si.id,
          'product_name', si.product_name,
          'variant_name', si.variant_name,
          'color', si.color,
          'storage', si.storage,
          'ram', si.ram,
          'usd_price', si.usd_price,
          'quantity', si.quantity,
          'subtotal_usd', si.subtotal_usd,
          'subtotal_ars', si.subtotal_ars,
          'is_gift', si.is_gift,
          'imeis', coalesce(
            (
              select jsonb_agg(sii.imei order by sii.id)
              from public.sale_item_imeis sii
              where sii.sale_item_id = si.id
            ), '[]'::jsonb
          )
        )
        order by si.id
      )
      from public.sale_items si
      where si.sale_id = s.id
    ), '[]'::jsonb
  ) as items,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'payment_method_id', sp.payment_method_id,
          'payment_method_name', pm.name,
          'amount_ars', sp.amount_ars,
          'amount_usd', sp.amount_usd,
          'installments', sp.installments,
          'reference', sp.reference
        )
      )
      from public.sale_payments sp
      left join public.payment_methods pm on pm.id = sp.payment_method_id
      where sp.sale_id = s.id
    ), '[]'::jsonb
  ) as payments,
  s.updated_fields
from public.sales s
left join public.sales_channels sc on sc.id = s.sales_channel_id
left join public.customers c on c.id = s.customer_id
left join public.users u on u.id_auth = s.seller_id;
