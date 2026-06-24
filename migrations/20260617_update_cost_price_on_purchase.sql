create or replace function public.create_purchase_with_inventory_units(
  p_provider_id bigint,
  p_purchase_date date,
  p_currency text,
  p_total_amount numeric,
  p_total_amount_ars numeric,
  p_fx_rate_used numeric,
  p_notes text,
  p_items jsonb,
  p_payments jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_purchase_id bigint;
  v_purchase_item_id bigint;
  v_item jsonb;
  v_payment jsonb;
  v_variant_id integer;
  v_quantity integer;
  v_unit_cost numeric;
  v_subtotal numeric;
  v_tracking_mode text;
  v_identifier text;
  v_identifier_count integer;
  v_received_at timestamp with time zone;
begin
  if not public.is_owner_or_superadmin() then
    raise exception 'Solo owner o superadmin puede registrar compras';
  end if;

  if p_provider_id is null then
    raise exception 'p_provider_id es obligatorio';
  end if;

  if p_purchase_date is null then
    raise exception 'p_purchase_date es obligatorio';
  end if;

  if p_currency not in ('ARS', 'USD', 'USDT') then
    raise exception 'Moneda invalida: %', p_currency;
  end if;

  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Debes enviar al menos un item';
  end if;

  v_received_at := p_purchase_date::timestamp at time zone 'America/Argentina/Buenos_Aires';

  insert into public.purchases (
    provider_id,
    purchase_date,
    currency,
    total_amount,
    total_amount_ars,
    fx_rate_used,
    notes,
    status
  ) values (
    p_provider_id,
    p_purchase_date,
    p_currency,
    p_total_amount,
    p_total_amount_ars,
    p_fx_rate_used,
    nullif(trim(coalesce(p_notes, '')), ''),
    'active'
  )
  returning id into v_purchase_id;

  for v_item in
    select *
    from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::integer;
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);

    if v_variant_id is null then
      raise exception 'Todos los items deben tener variant_id';
    end if;

    if v_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor a cero para la variante %', v_variant_id;
    end if;

    if v_unit_cost < 0 then
      raise exception 'El costo unitario no puede ser negativo para la variante %', v_variant_id;
    end if;

    select p.inventory_tracking_mode
      into v_tracking_mode
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id;

    if not found then
      raise exception 'No se encontro la variante %', v_variant_id;
    end if;

    v_subtotal := v_quantity * v_unit_cost;

    insert into public.purchase_items (
      purchase_id,
      variant_id,
      quantity,
      unit_cost,
      subtotal
    ) values (
      v_purchase_id,
      v_variant_id,
      v_quantity,
      v_unit_cost,
      v_subtotal
    )
    returning id into v_purchase_item_id;

    update public.product_variants
    set stock = coalesce(stock, 0) + v_quantity,
        cost_price_usd = case
          when p_currency in ('USD', 'USDT') then v_unit_cost
          when p_currency = 'ARS' and p_fx_rate_used is not null and p_fx_rate_used > 0
            then v_unit_cost / p_fx_rate_used
          else cost_price_usd
        end,
        updated_at = now()
    where id = v_variant_id;

    if v_tracking_mode = 'serial' then
      v_identifier_count := coalesce(jsonb_array_length(v_item -> 'identifiers'), 0);

      if v_identifier_count <> v_quantity then
        raise exception
          'La variante % requiere % IMEI/SN y se recibieron %',
          v_variant_id,
          v_quantity,
          v_identifier_count;
      end if;

      for v_identifier in
        select nullif(trim(jsonb_array_elements_text(v_item -> 'identifiers')), '')
      loop
        if v_identifier is null then
          raise exception 'Todos los IMEI/SN deben estar completos para la variante %', v_variant_id;
        end if;

        insert into public.inventory_units (
          variant_id,
          purchase_id,
          purchase_item_id,
          identifier_value,
          status,
          received_at,
          notes,
          updated_by
        ) values (
          v_variant_id,
          v_purchase_id,
          v_purchase_item_id,
          v_identifier,
          'available',
          v_received_at,
          'Ingreso por compra',
          auth.uid()
        );

        insert into public.inventory_unit_events (
          inventory_unit_id,
          event_type,
          from_status,
          to_status,
          related_table,
          related_id,
          notes
        )
        select
          iu.id,
          'purchase_received',
          null,
          'available',
          'purchases',
          v_purchase_id,
          'Ingreso inicial por compra'
        from public.inventory_units iu
        where iu.purchase_item_id = v_purchase_item_id
          and iu.identifier_value = v_identifier
        order by iu.id desc
        limit 1;
      end loop;
    end if;
  end loop;

  for v_payment in
    select *
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    insert into public.purchase_payments (
      purchase_id,
      account_id,
      payment_method_id,
      amount,
      currency,
      amount_ars,
      fx_rate_used,
      notes
    ) values (
      v_purchase_id,
      (v_payment ->> 'account_id')::bigint,
      nullif(v_payment ->> 'payment_method_id', '')::integer,
      coalesce((v_payment ->> 'amount')::numeric, 0),
      v_payment ->> 'currency',
      coalesce((v_payment ->> 'amount_ars')::numeric, 0),
      nullif(v_payment ->> 'fx_rate_used', '')::numeric,
      nullif(trim(coalesce(p_notes, '')), '')
    );
  end loop;

  return json_build_object('purchase_id', v_purchase_id);
end;
$function$;
