-- Stage 4: integrate warranty and aftersales flows with inventory_units.

alter table public.aftersales_devices
add column if not exists inventory_unit_id bigint references public.inventory_units(id);

create index if not exists aftersales_devices_inventory_unit_id_idx
  on public.aftersales_devices (inventory_unit_id);

alter table public.warranty_exchanges
add column if not exists original_inventory_unit_id bigint references public.inventory_units(id);

create index if not exists warranty_exchanges_original_inventory_unit_id_idx
  on public.warranty_exchanges (original_inventory_unit_id);

alter table public.warranty_exchange_items
add column if not exists inventory_unit_id bigint references public.inventory_units(id);

create index if not exists warranty_exchange_items_inventory_unit_id_idx
  on public.warranty_exchange_items (inventory_unit_id);

create or replace function public.register_aftersales_device(
  p_variant_id integer,
  p_quantity integer default 1,
  p_imei text default null,
  p_notes text default null,
  p_include_in_stock_cost_balance boolean default false,
  p_inventory_unit_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_stock integer;
  device_id bigint;
  v_tracking_mode text;
  v_inventory_unit public.inventory_units%rowtype;
begin
  if not public.is_owner_or_superadmin() then
    raise exception 'Solo owner o superadmin puede registrar equipos en postventa';
  end if;

  if p_variant_id is null then
    raise exception 'p_variant_id es obligatorio';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select
    coalesce(pv.stock, 0),
    coalesce(p.inventory_tracking_mode, 'quantity')
    into current_stock, v_tracking_mode
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id
  for update of pv;

  if not found then
    raise exception 'No se encontro la variante %', p_variant_id;
  end if;

  if current_stock < p_quantity then
    raise exception
      'No hay stock suficiente para mover a postventa. Stock actual %, requerido %',
      current_stock,
      p_quantity;
  end if;

  if v_tracking_mode = 'serial' then
    if p_inventory_unit_id is null then
      raise exception 'Debes seleccionar la unidad serializada para enviar a postventa';
    end if;

    if p_quantity <> 1 then
      raise exception 'Los productos serializados solo pueden enviarse a postventa de a una unidad';
    end if;

    select *
      into v_inventory_unit
    from public.inventory_units
    where id = p_inventory_unit_id
    for update;

    if not found then
      raise exception 'No se encontro la unidad %', p_inventory_unit_id;
    end if;

    if v_inventory_unit.variant_id <> p_variant_id then
      raise exception 'La unidad % no pertenece a la variante %', p_inventory_unit_id, p_variant_id;
    end if;

    if v_inventory_unit.status <> 'available' then
      raise exception 'La unidad % no esta disponible para postventa', v_inventory_unit.identifier_value;
    end if;
  end if;

  update public.product_variants
  set stock = coalesce(stock, 0) - p_quantity,
      stock_defective = coalesce(stock_defective, 0) + p_quantity,
      updated_at = now()
  where id = p_variant_id;

  insert into public.aftersales_devices (
    variant_id,
    source_type,
    imei,
    quantity,
    status,
    notes,
    created_by,
    include_in_stock_cost_balance,
    inventory_unit_id
  ) values (
    p_variant_id,
    'factory',
    case
      when v_tracking_mode = 'serial' then v_inventory_unit.identifier_value
      else nullif(trim(coalesce(p_imei, '')), '')
    end,
    p_quantity,
    'defective_in_store',
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    coalesce(p_include_in_stock_cost_balance, false),
    case when v_tracking_mode = 'serial' then v_inventory_unit.id else null end
  )
  returning id into device_id;

  if v_tracking_mode = 'serial' then
    update public.inventory_units
    set status = 'defective',
        updated_by = auth.uid()
    where id = v_inventory_unit.id;

    insert into public.inventory_unit_events (
      inventory_unit_id,
      event_type,
      from_status,
      to_status,
      related_table,
      related_id,
      notes,
      payload
    ) values (
      v_inventory_unit.id,
      'aftersales_registered',
      'available',
      'defective',
      'aftersales_devices',
      device_id,
      nullif(trim(coalesce(p_notes, '')), ''),
      jsonb_build_object('source_type', 'factory')
    );
  end if;

  return device_id;
end;
$function$;

create or replace function public.update_aftersales_device_status(
  p_aftersales_device_id bigint,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  device_row public.aftersales_devices%rowtype;
  current_stock integer;
  current_stock_defective integer;
  v_target_unit_status text;
begin
  if not public.is_owner_or_superadmin() then
    raise exception 'Solo owner o superadmin puede actualizar postventa';
  end if;

  if p_aftersales_device_id is null then
    raise exception 'p_aftersales_device_id es obligatorio';
  end if;

  if p_status not in ('defective_in_store', 'in_repair', 'repaired') then
    raise exception 'Estado invalido';
  end if;

  select *
    into device_row
  from public.aftersales_devices
  where id = p_aftersales_device_id
  for update;

  if not found then
    raise exception 'No se encontro el registro de postventa %', p_aftersales_device_id;
  end if;

  if device_row.sold_sale_id is not null then
    raise exception 'El equipo ya fue vendido desde postventa';
  end if;

  if device_row.status = p_status then
    update public.aftersales_devices
    set notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
        updated_at = now()
    where id = p_aftersales_device_id;
    return;
  end if;

  select coalesce(stock, 0), coalesce(stock_defective, 0)
    into current_stock, current_stock_defective
  from public.product_variants
  where id = device_row.variant_id
  for update;

  if device_row.status <> 'repaired' and p_status = 'repaired' then
    if current_stock_defective < device_row.quantity then
      raise exception
        'No hay stock defectuoso suficiente para reparar. Defectuoso actual %, requerido %',
        current_stock_defective,
        device_row.quantity;
    end if;

    update public.product_variants
    set stock = coalesce(stock, 0) + device_row.quantity,
        stock_defective = coalesce(stock_defective, 0) - device_row.quantity,
        updated_at = now()
    where id = device_row.variant_id;
  elsif device_row.status = 'repaired' and p_status <> 'repaired' then
    if current_stock < device_row.quantity then
      raise exception
        'No hay stock disponible suficiente para volver a marcar como defectuoso. Stock actual %, requerido %',
        current_stock,
        device_row.quantity;
    end if;

    update public.product_variants
    set stock = coalesce(stock, 0) - device_row.quantity,
        stock_defective = coalesce(stock_defective, 0) + device_row.quantity,
        updated_at = now()
    where id = device_row.variant_id;
  end if;

  update public.aftersales_devices
  set status = p_status,
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      updated_at = now()
  where id = p_aftersales_device_id;

  if device_row.inventory_unit_id is not null then
    v_target_unit_status :=
      case
        when p_status = 'repaired' then 'available'
        when p_status = 'in_repair' then 'in_repair'
        else 'defective'
      end;

    update public.inventory_units
    set status = v_target_unit_status,
        updated_by = auth.uid()
    where id = device_row.inventory_unit_id;

    insert into public.inventory_unit_events (
      inventory_unit_id,
      event_type,
      from_status,
      to_status,
      related_table,
      related_id,
      notes,
      payload
    ) values (
      device_row.inventory_unit_id,
      'aftersales_status_changed',
      case
        when device_row.status = 'repaired' then 'available'
        when device_row.status = 'in_repair' then 'in_repair'
        else 'defective'
      end,
      v_target_unit_status,
      'aftersales_devices',
      device_row.id,
      nullif(trim(coalesce(p_notes, '')), ''),
      jsonb_build_object('aftersales_status', p_status)
    );
  end if;
end;
$function$;
create or replace function public.create_aftersales_sale(
  p_aftersales_device_id bigint,
  p_customer_id integer,
  p_seller_id uuid,
  p_sales_channel_id integer,
  p_unit_price_usd numeric,
  p_total_usd numeric,
  p_total_ars numeric,
  p_fx_rate numeric,
  p_notes text default null,
  p_payments jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_device public.aftersales_devices%rowtype;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_sale_id bigint;
  v_sale_item_id bigint;
  v_payment jsonb;
  v_payment_method_name text;
  v_amount numeric;
  v_amount_ars numeric;
  v_amount_usd numeric;
  v_installments integer;
  v_reference text;
  v_account_id bigint;
  v_inventory_unit public.inventory_units%rowtype;
begin
  if not public.is_owner_or_superadmin() then
    raise exception 'Solo owner o superadmin puede vender desde postventa';
  end if;

  if p_aftersales_device_id is null then
    raise exception 'p_aftersales_device_id es obligatorio';
  end if;

  if p_customer_id is null then
    raise exception 'p_customer_id es obligatorio';
  end if;

  if coalesce(p_unit_price_usd, 0) < 0 then
    raise exception 'El precio por unidad no puede ser negativo';
  end if;

  if coalesce(p_total_ars, 0) < 0 then
    raise exception 'El total no puede ser negativo';
  end if;

  if coalesce(p_fx_rate, 0) <= 0 then
    raise exception 'No hay cotizacion valida';
  end if;

  select *
    into v_device
  from public.aftersales_devices
  where id = p_aftersales_device_id
  for update;

  if not found then
    raise exception 'No se encontro el equipo de postventa %', p_aftersales_device_id;
  end if;

  if v_device.sold_sale_id is not null then
    raise exception 'El equipo de postventa ya fue vendido';
  end if;

  if v_device.status <> 'defective_in_store' then
    raise exception 'Solo se puede vender desde postventa un equipo defectuoso en local';
  end if;

  if p_sales_channel_id is not null then
    if not exists (
      select 1
      from public.sales_channels sc
      where sc.id = p_sales_channel_id
        and sc.is_active = true
    ) then
      raise exception 'Canal invalido o inactivo: %', p_sales_channel_id;
    end if;
  end if;

  select *
    into v_variant
  from public.product_variants
  where id = v_device.variant_id
  for update;

  if not found then
    raise exception 'No se encontro la variante asociada al equipo de postventa';
  end if;

  if coalesce(v_variant.stock_defective, 0) < coalesce(v_device.quantity, 0) then
    raise exception
      'No hay stock defectuoso suficiente. Defectuoso actual %, requerido %',
      coalesce(v_variant.stock_defective, 0),
      coalesce(v_device.quantity, 0);
  end if;

  select *
    into v_product
  from public.products
  where id = v_variant.product_id;

  if coalesce(v_product.inventory_tracking_mode, 'quantity') = 'serial' then
    if v_device.inventory_unit_id is null then
      raise exception 'El equipo de postventa serializado no tiene unidad vinculada';
    end if;

    if v_device.quantity <> 1 then
      raise exception 'Los equipos serializados en postventa deben tener cantidad 1';
    end if;

    select *
      into v_inventory_unit
    from public.inventory_units
    where id = v_device.inventory_unit_id
    for update;

    if not found then
      raise exception 'No se encontro la unidad vinculada al equipo de postventa';
    end if;
  end if;

  insert into public.sales (
    customer_id,
    seller_id,
    total_usd,
    total_ars,
    fx_rate_used,
    notes,
    payments,
    sales_channel_id,
    sale_date
  )
  values (
    p_customer_id,
    p_seller_id,
    p_total_usd,
    p_total_ars,
    p_fx_rate,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_payments,
    p_sales_channel_id,
    now() at time zone 'America/Argentina/Buenos_Aires'
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    sale_id,
    variant_id,
    product_name,
    variant_name,
    color,
    storage,
    ram,
    usd_price,
    quantity,
    subtotal_usd,
    subtotal_ars,
    imei,
    commission_pct,
    commission_fixed
  )
  values (
    v_sale_id,
    v_variant.id,
    v_product.name,
    v_variant.variant_name,
    v_variant.color,
    v_variant.storage,
    v_variant.ram,
    p_unit_price_usd,
    v_device.quantity,
    p_unit_price_usd * v_device.quantity,
    p_total_ars,
    nullif(trim(coalesce(v_device.imei, '')), ''),
    v_product.commission_pct,
    v_product.commission_fixed
  )
  returning id into v_sale_item_id;

  if coalesce(v_product.inventory_tracking_mode, 'quantity') = 'serial' then
    insert into public.sale_item_imeis (sale_item_id, imei, inventory_unit_id)
    values (v_sale_item_id, v_inventory_unit.identifier_value, v_inventory_unit.id);

    update public.inventory_units
    set status = 'sold',
        sale_id = v_sale_id,
        sale_item_id = v_sale_item_id,
        sold_at = now(),
        returned_at = null,
        updated_by = auth.uid()
    where id = v_inventory_unit.id;

    insert into public.inventory_unit_events (
      inventory_unit_id,
      event_type,
      from_status,
      to_status,
      related_table,
      related_id,
      notes,
      payload
    ) values (
      v_inventory_unit.id,
      'aftersales_sale_created',
      'defective',
      'sold',
      'sales',
      v_sale_id,
      nullif(trim(coalesce(p_notes, '')), ''),
      jsonb_build_object('sale_item_id', v_sale_item_id, 'aftersales_device_id', v_device.id)
    );
  elsif nullif(trim(coalesce(v_device.imei, '')), '') is not null then
    insert into public.sale_item_imeis (sale_item_id, imei)
    values (v_sale_item_id, trim(v_device.imei));
  end if;

  update public.product_variants
  set stock_defective = stock_defective - v_device.quantity,
      updated_at = now()
  where id = v_variant.id;

  for v_payment in
    select *
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    v_amount := coalesce(nullif(v_payment ->> 'amount', '')::numeric, 0);
    v_installments := nullif(v_payment ->> 'installments', '')::integer;
    v_reference := v_payment ->> 'reference';
    v_account_id := nullif(v_payment ->> 'account_id', '')::bigint;

    select name
      into v_payment_method_name
    from public.payment_methods
    where id = (v_payment ->> 'payment_method_id')::integer;

    if upper(coalesce(v_payment_method_name, '')) in ('USD', 'USDT') then
      v_amount_usd := v_amount;
      v_amount_ars := v_amount * p_fx_rate;
    else
      v_amount_ars := v_amount;
      v_amount_usd := null;
    end if;

    insert into public.sale_payments (
      sale_id,
      payment_method_id,
      amount_ars,
      amount_usd,
      installments,
      reference,
      account_id
    )
    values (
      v_sale_id,
      (v_payment ->> 'payment_method_id')::integer,
      v_amount_ars,
      v_amount_usd,
      v_installments,
      v_reference,
      v_account_id
    );
  end loop;

  update public.aftersales_devices
  set sold_sale_id = v_sale_id,
      sold_at = now(),
      include_in_stock_cost_balance = false,
      updated_at = now(),
      notes = concat(
        coalesce(notes, ''),
        case when nullif(trim(coalesce(notes, '')), '') is not null then ' | ' else '' end,
        'Vendido desde postventa en venta #',
        v_sale_id
      )
  where id = p_aftersales_device_id;

  return json_build_object('sale_id', v_sale_id);
end;
$function$;
create or replace function public.process_warranty_exchange(
  p_sale_id bigint,
  p_sale_item_id bigint,
  p_return_bucket text,
  p_replacements jsonb,
  p_reason text,
  p_notes text default null,
  p_settlement_account_id bigint default null,
  p_settlement_payment_method_id integer default null,
  p_settlement_installments integer default null,
  p_settlement_multiplier numeric default null,
  p_settlement_currency text default null,
  p_settlement_amount numeric default null,
  p_settlement_amount_ars numeric default null,
  p_settlement_fx_rate_used numeric default null,
  p_original_inventory_unit_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sale_row public.sales%rowtype;
  sale_item_row public.sale_items%rowtype;
  replacement_row jsonb;
  replacement_variant_row record;
  replacement_total_usd numeric := 0;
  original_total_usd numeric;
  difference_usd numeric;
  warranty_id bigint;
  item_quantity integer;
  original_imei_value text;
  settlement_type_value text := 'none';
  settlement_account_currency text;
  replacement_items_count integer := 0;
  first_replacement_variant_id integer;
  first_replacement_imei text;
  store_credit_ars_value numeric := null;
  v_original_inventory_unit public.inventory_units%rowtype;
  v_original_tracking_mode text;
  v_original_units_count integer;
  v_replacement_inventory_unit public.inventory_units%rowtype;
begin
  if not public.is_owner_or_superadmin() then
    raise exception 'Solo owner o superadmin puede procesar garantias';
  end if;

  if p_sale_id is null then
    raise exception 'p_sale_id es obligatorio';
  end if;

  if p_sale_item_id is null then
    raise exception 'p_sale_item_id es obligatorio';
  end if;

  if p_return_bucket not in ('available', 'defective') then
    raise exception 'Bucket invalido. Use available o defective';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'El motivo de garantia es obligatorio';
  end if;

  if p_replacements is null or jsonb_typeof(p_replacements) <> 'array' or jsonb_array_length(p_replacements) = 0 then
    raise exception 'Debes enviar al menos un producto de reemplazo';
  end if;

  select *
    into sale_row
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'No se encontro la venta %', p_sale_id;
  end if;

  if sale_row.status = 'anulado' then
    raise exception 'No se puede gestionar garantia sobre una venta anulada';
  end if;

  select
    si.*
    into sale_item_row
  from public.sale_items si
  join public.product_variants pv on pv.id = si.variant_id
  join public.products p on p.id = pv.product_id
  where si.id = p_sale_item_id
    and si.sale_id = p_sale_id
  for update of si;

  if not found then
    raise exception 'No se encontro el item % para la venta %', p_sale_item_id, p_sale_id;
  end if;

  if sale_item_row.variant_id is null then
    raise exception 'El item seleccionado no tiene variante asociada';
  end if;

  select coalesce(p.inventory_tracking_mode, 'quantity')
    into v_original_tracking_mode
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = sale_item_row.variant_id;

  item_quantity := greatest(coalesce(sale_item_row.quantity, 0), 1);
  original_imei_value := nullif(trim(coalesce(sale_item_row.imei, '')), '');

  if v_original_tracking_mode = 'serial' then
    select count(*)
      into v_original_units_count
    from public.inventory_units
    where sale_item_id = p_sale_item_id;

    if p_original_inventory_unit_id is not null then
      select *
        into v_original_inventory_unit
      from public.inventory_units
      where id = p_original_inventory_unit_id
      for update;

      if not found then
        raise exception 'No se encontro la unidad original seleccionada';
      end if;

      if v_original_inventory_unit.sale_item_id <> p_sale_item_id then
        raise exception 'La unidad original seleccionada no pertenece al item de venta';
      end if;
    elsif v_original_units_count = 1 then
      select *
        into v_original_inventory_unit
      from public.inventory_units
      where sale_item_id = p_sale_item_id
      for update;
    else
      raise exception 'Debes seleccionar la unidad exacta para gestionar la garantia del item serializado';
    end if;

    item_quantity := 1;
    original_imei_value := v_original_inventory_unit.identifier_value;
  elsif original_imei_value is null then
    select nullif(trim(coalesce(sii.imei, '')), '')
      into original_imei_value
    from public.sale_item_imeis sii
    where sii.sale_item_id = p_sale_item_id
    order by sii.id asc
    limit 1;
  end if;

  original_total_usd := coalesce(sale_item_row.subtotal_usd, sale_item_row.usd_price * item_quantity, 0);

  for replacement_row in
    select value
    from jsonb_array_elements(p_replacements)
  loop
    replacement_items_count := replacement_items_count + 1;

    if coalesce((replacement_row ->> 'variant_id')::integer, 0) <= 0 then
      raise exception 'Cada reemplazo debe tener variant_id';
    end if;

    if coalesce((replacement_row ->> 'quantity')::integer, 0) <= 0 then
      raise exception 'Cada reemplazo debe tener quantity mayor a cero';
    end if;

    select
      pv.id,
      pv.usd_price,
      pv.stock,
      p.active,
      coalesce(p.inventory_tracking_mode, 'quantity') as inventory_tracking_mode
      into replacement_variant_row
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (replacement_row ->> 'variant_id')::integer
    for update of pv;

    if not found then
      raise exception 'No se encontro la variante de reemplazo %', replacement_row ->> 'variant_id';
    end if;

    if not replacement_variant_row.active then
      raise exception 'La variante de reemplazo % pertenece a un producto inactivo', replacement_variant_row.id;
    end if;

    if replacement_variant_row.inventory_tracking_mode = 'serial' then
      if coalesce((replacement_row ->> 'inventory_unit_id')::bigint, 0) <= 0 then
        raise exception 'Debes seleccionar la unidad serializada de reemplazo';
      end if;

      if (replacement_row ->> 'quantity')::integer <> 1 then
        raise exception 'Los reemplazos serializados deben tener cantidad 1';
      end if;

      select *
        into v_replacement_inventory_unit
      from public.inventory_units
      where id = (replacement_row ->> 'inventory_unit_id')::bigint
      for update;

      if not found then
        raise exception 'No se encontro la unidad serializada de reemplazo';
      end if;

      if v_replacement_inventory_unit.variant_id <> replacement_variant_row.id then
        raise exception 'La unidad de reemplazo no pertenece a la variante seleccionada';
      end if;

      if v_replacement_inventory_unit.status <> 'available' then
        raise exception 'La unidad de reemplazo % no esta disponible', v_replacement_inventory_unit.identifier_value;
      end if;
    end if;

    if replacement_variant_row.stock
      + (
        case
          when p_return_bucket = 'available'
            and replacement_variant_row.id = sale_item_row.variant_id
            then item_quantity
          else 0
        end
      )
      < (replacement_row ->> 'quantity')::integer then
      raise exception
        'No hay stock suficiente para la variante % . Stock actual %, requerido %',
        replacement_variant_row.id,
        replacement_variant_row.stock,
        (replacement_row ->> 'quantity')::integer;
    end if;

    replacement_total_usd :=
      replacement_total_usd
      + (coalesce(replacement_variant_row.usd_price, 0) * (replacement_row ->> 'quantity')::integer);

    if replacement_items_count = 1 then
      first_replacement_variant_id := replacement_variant_row.id;
      first_replacement_imei :=
        case
          when replacement_variant_row.inventory_tracking_mode = 'serial'
            then v_replacement_inventory_unit.identifier_value
          else nullif(trim(coalesce(replacement_row ->> 'imei', '')), '')
        end;
    end if;
  end loop;

  difference_usd := round((replacement_total_usd - original_total_usd)::numeric, 2);

  if difference_usd > 0.009 then
    if p_settlement_account_id is null then
      raise exception 'Debes seleccionar la cuenta para liquidar la diferencia';
    end if;

    if p_settlement_payment_method_id is null then
      raise exception 'Debes seleccionar el metodo de pago para liquidar la diferencia';
    end if;

    if p_settlement_currency is null then
      raise exception 'Debes indicar la moneda de la diferencia';
    end if;

    if coalesce(p_settlement_amount, 0) <= 0 then
      raise exception 'El monto de la diferencia debe ser mayor a cero';
    end if;

    select currency
      into settlement_account_currency
    from public.accounts
    where id = p_settlement_account_id
    for update;

    if not found then
      raise exception 'No se encontro la cuenta seleccionada';
    end if;

    if settlement_account_currency <> p_settlement_currency then
      raise exception 'La moneda de la cuenta no coincide con la moneda de liquidacion';
    end if;

    settlement_type_value := 'customer_payment';
  elsif difference_usd < -0.009 then
    settlement_type_value := 'store_credit';
    if p_settlement_fx_rate_used is not null then
      store_credit_ars_value := round(abs(difference_usd) * p_settlement_fx_rate_used, 2);
    end if;
  end if;

  if p_return_bucket = 'available' then
    update public.product_variants
    set stock = coalesce(stock, 0) + item_quantity,
        updated_at = now()
    where id = sale_item_row.variant_id;
  else
    update public.product_variants
    set stock_defective = coalesce(stock_defective, 0) + item_quantity,
        updated_at = now()
    where id = sale_item_row.variant_id;
  end if;

  for replacement_row in
    select value
    from jsonb_array_elements(p_replacements)
  loop
    update public.product_variants
    set stock = coalesce(stock, 0) - (replacement_row ->> 'quantity')::integer,
        updated_at = now()
    where id = (replacement_row ->> 'variant_id')::integer;
  end loop;

  insert into public.warranty_exchanges (
    sale_id,
    sale_item_id,
    original_variant_id,
    original_imei,
    quantity,
    returned_stock_bucket,
    replacement_variant_id,
    replacement_imei,
    reason,
    notes,
    status,
    created_by,
    price_difference_usd,
    settlement_type,
    settlement_account_id,
    settlement_payment_method_id,
    settlement_installments,
    settlement_multiplier,
    settlement_currency,
    settlement_amount,
    settlement_amount_ars,
    settlement_fx_rate_used,
    store_credit_usd,
    store_credit_amount_ars,
    original_inventory_unit_id
  ) values (
    p_sale_id,
    p_sale_item_id,
    sale_item_row.variant_id,
    original_imei_value,
    item_quantity,
    p_return_bucket,
    first_replacement_variant_id,
    first_replacement_imei,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    'completed',
    auth.uid(),
    difference_usd,
    settlement_type_value,
    case when settlement_type_value = 'customer_payment' then p_settlement_account_id else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_payment_method_id else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_installments else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_multiplier else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_currency else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_amount else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_amount_ars else null end,
    case when settlement_type_value = 'customer_payment' then p_settlement_fx_rate_used else null end,
    case when settlement_type_value = 'store_credit' then abs(difference_usd) else 0 end,
    case when settlement_type_value = 'store_credit' then store_credit_ars_value else null end,
    case when v_original_tracking_mode = 'serial' then v_original_inventory_unit.id else null end
  )
  returning id into warranty_id;

  if v_original_tracking_mode = 'serial' then
    update public.inventory_units
    set status = case when p_return_bucket = 'available' then 'available' else 'defective' end,
        sale_id = null,
        sale_item_id = null,
        returned_at = now(),
        warranty_exchange_id = warranty_id,
        updated_by = auth.uid()
    where id = v_original_inventory_unit.id;

    insert into public.inventory_unit_events (
      inventory_unit_id,
      event_type,
      from_status,
      to_status,
      related_table,
      related_id,
      notes,
      payload
    ) values (
      v_original_inventory_unit.id,
      'warranty_returned',
      'sold',
      case when p_return_bucket = 'available' then 'available' else 'defective' end,
      'warranty_exchanges',
      warranty_id,
      trim(p_reason),
      jsonb_build_object('sale_item_id', p_sale_item_id, 'bucket', p_return_bucket)
    );
  end if;

  for replacement_row in
    select value
    from jsonb_array_elements(p_replacements)
  loop
    if exists (
      select 1
      from public.products p
      join public.product_variants pv on pv.product_id = p.id
      where pv.id = (replacement_row ->> 'variant_id')::integer
        and coalesce(p.inventory_tracking_mode, 'quantity') = 'serial'
    ) then
      select *
        into v_replacement_inventory_unit
      from public.inventory_units
      where id = (replacement_row ->> 'inventory_unit_id')::bigint
      for update;

      update public.inventory_units
      set status = 'sold',
          sale_id = p_sale_id,
          sale_item_id = p_sale_item_id,
          sold_at = now(),
          returned_at = null,
          warranty_exchange_id = warranty_id,
          updated_by = auth.uid()
      where id = v_replacement_inventory_unit.id;

      insert into public.sale_item_imeis (sale_item_id, imei, inventory_unit_id)
      select p_sale_item_id, v_replacement_inventory_unit.identifier_value, v_replacement_inventory_unit.id
      where not exists (
        select 1
        from public.sale_item_imeis
        where sale_item_id = p_sale_item_id
          and inventory_unit_id = v_replacement_inventory_unit.id
      );

      insert into public.inventory_unit_events (
        inventory_unit_id,
        event_type,
        from_status,
        to_status,
        related_table,
        related_id,
        notes,
        payload
      ) values (
        v_replacement_inventory_unit.id,
        'warranty_replacement_delivered',
        'available',
        'sold',
        'warranty_exchanges',
        warranty_id,
        trim(p_reason),
        jsonb_build_object('sale_id', p_sale_id, 'sale_item_id', p_sale_item_id)
      );
    end if;

    insert into public.warranty_exchange_items (
      warranty_exchange_id,
      variant_id,
      imei,
      quantity,
      unit_price_usd,
      subtotal_usd,
      inventory_unit_id
    )
    select
      warranty_id,
      pv.id,
      case
        when coalesce(p.inventory_tracking_mode, 'quantity') = 'serial'
          then (
            select iu.identifier_value
            from public.inventory_units iu
            where iu.id = (replacement_row ->> 'inventory_unit_id')::bigint
          )
        else nullif(trim(coalesce(replacement_row ->> 'imei', '')), '')
      end,
      (replacement_row ->> 'quantity')::integer,
      coalesce(pv.usd_price, 0),
      coalesce(pv.usd_price, 0) * (replacement_row ->> 'quantity')::integer,
      case
        when coalesce(p.inventory_tracking_mode, 'quantity') = 'serial'
          then (replacement_row ->> 'inventory_unit_id')::bigint
        else null
      end
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (replacement_row ->> 'variant_id')::integer;
  end loop;

  if settlement_type_value = 'customer_payment' then
    insert into public.account_movements (
      account_id,
      type,
      amount,
      currency,
      amount_ars,
      fx_rate_used,
      related_table,
      related_id,
      notes,
      movement_date
    ) values (
      p_settlement_account_id,
      'income',
      p_settlement_amount,
      p_settlement_currency,
      p_settlement_amount_ars,
      p_settlement_fx_rate_used,
      'warranty_exchange_settlement',
      warranty_id,
      format('Cobro diferencia de garantia | Venta #%s', p_sale_id),
      current_date
    );
  end if;

  if p_return_bucket = 'defective' then
    insert into public.aftersales_devices (
      variant_id,
      sale_id,
      warranty_exchange_id,
      source_type,
      imei,
      quantity,
      status,
      notes,
      created_by,
      inventory_unit_id
    ) values (
      sale_item_row.variant_id,
      p_sale_id,
      warranty_id,
      'warranty',
      original_imei_value,
      item_quantity,
      'defective_in_store',
      concat('Garantia: ', trim(p_reason), coalesce(case when nullif(trim(coalesce(p_notes, '')), '') is not null then ' | ' || trim(p_notes) else null end, '')),
      auth.uid(),
      case when v_original_tracking_mode = 'serial' then v_original_inventory_unit.id else null end
    );
  end if;

  return warranty_id;
end;
$function$;
