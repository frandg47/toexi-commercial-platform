## Table `brands`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  Unique |

## Table `categories`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  Unique |

## Table `payment_methods`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  Unique |
| `multiplier` | `numeric` |  |
| `is_active` | `bool` |  |
| `accreditation_delay_business_days` | `int4` |  |
| `account_id` | `int8` |  Nullable |

## Table `products`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `name` | `text` |  |
| `brand_id` | `int4` |  Nullable |
| `category_id` | `int4` |  |
| `usd_price` | `numeric` |  Nullable |
| `commission_pct` | `numeric` |  Nullable |
| `commission_fixed` | `numeric` |  Nullable |
| `allow_backorder` | `bool` |  |
| `lead_time_label` | `text` |  Nullable |
| `active` | `bool` |  |
| `cover_image_url` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `deposit_amount` | `float4` |  Nullable |
| `inventory_tracking_mode` | `text` |  |

## Table `fx_rates`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `source` | `text` |  Nullable |
| `rate` | `numeric` |  |
| `is_active` | `bool` |  |
| `updated_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  Nullable |
| `created_by` | `text` |  Nullable |
| `notes` | `text` |  Nullable |

## Table `commission_rules`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `category_id` | `int4` |  Nullable |
| `brand_id` | `int4` |  Nullable |
| `commission_pct` | `numeric` |  Nullable |
| `commission_fixed` | `numeric` |  Nullable |
| `priority` | `int4` |  |

## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `created_at` | `timestamptz` |  |
| `name` | `text` |  Nullable |
| `dni` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `role` | `text` |  Nullable |
| `last_name` | `text` |  Nullable |
| `adress` | `text` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `id_auth` | `uuid` |  Nullable Unique |
| `avatar_url` | `text` |  Nullable |

## Table `payment_installments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `payment_method_id` | `int4` |  |
| `installments` | `int4` |  |
| `multiplier` | `numeric` |  |
| `description` | `text` |  Nullable |

## Table `product_variants`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `product_id` | `int4` |  |
| `storage` | `text` |  Nullable |
| `ram` | `text` |  Nullable |
| `color` | `text` |  Nullable |
| `sku` | `text` |  Nullable Unique |
| `usd_price` | `numeric` |  Nullable |
| `stock` | `int4` |  |
| `image_url` | `text` |  Nullable |
| `active` | `bool` |  |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |
| `variant_name` | `text` |  Nullable |
| `processor` | `text` |  Nullable |
| `graphics_card` | `text` |  Nullable |
| `screen_size` | `text` |  Nullable |
| `resolution` | `text` |  Nullable |
| `storage_type` | `text` |  Nullable |
| `storage_capacity` | `text` |  Nullable |
| `ram_type` | `text` |  Nullable |
| `ram_frequency` | `text` |  Nullable |
| `battery` | `text` |  Nullable |
| `weight` | `text` |  Nullable |
| `operating_system` | `text` |  Nullable |
| `camera_main` | `text` |  Nullable |
| `camera_front` | `text` |  Nullable |
| `wholesale_price` | `numeric` |  Nullable |
| `stock_defective` | `int4` |  |
| `cost_price_usd` | `numeric` |  Nullable |

## Table `user_roles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id_auth` | `uuid` | Primary |
| `role` | `text` |  Nullable |

## Table `customers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary Identity |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `name` | `text` |  |
| `last_name` | `text` |  Nullable |
| `dni` | `text` |  Nullable Unique |
| `phone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `city` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `is_active` | `bool` |  |

## Table `leads`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary Identity |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `referred_by` | `uuid` |  |
| `customer_id` | `int4` |  Nullable |
| `appointment_datetime` | `timestamptz` |  Nullable |
| `qr_code` | `text` |  Nullable Unique |
| `status` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `sale_id` | `int4` |  Nullable Unique |
| `interested_variants` | `jsonb` |  Nullable |
| `product_status` | `varchar` |  Nullable |
| `deposit_paid` | `bool` |  |
| `deposit_amount` | `numeric` |  |
| `deposit_currency` | `text` |  |
| `fulfillment_type` | `text` |  |
| `reserved_variant_id` | `int4` |  Nullable |
| `reservation_expires_at` | `timestamptz` |  Nullable |
| `reserved_inventory_unit_id` | `int8` |  Nullable |

## Table `commission_payments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary Identity |
| `seller_id` | `uuid` |  |
| `period_start` | `date` |  |
| `period_end` | `date` |  |
| `total_amount` | `numeric` |  |
| `paid_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |

## Table `sales`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `customer_id` | `int4` |  Nullable |
| `seller_id` | `uuid` |  Nullable |
| `lead_id` | `int4` |  Nullable |
| `total_usd` | `numeric` |  Nullable |
| `total_ars` | `numeric` |  Nullable |
| `fx_rate_used` | `numeric` |  Nullable |
| `notes` | `text` |  Nullable |
| `sale_date` | `timestamp` |  Nullable |
| `status` | `text` |  Nullable |
| `payments` | `jsonb` |  Nullable |
| `discount_type` | `text` |  Nullable |
| `discount_value` | `numeric` |  Nullable |
| `discount_amount` | `numeric` |  Nullable |
| `voided_at` | `timestamptz` |  Nullable |
| `voided_by` | `uuid` |  Nullable |
| `void_reason` | `text` |  Nullable |
| `void_stock_bucket` | `text` |  Nullable |
| `sales_channel_id` | `int4` |  Nullable |
| `surcharge_type` | `text` |  Nullable |
| `surcharge_value` | `numeric` |  Nullable |
| `surcharge_amount` | `numeric` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `updated_by` | `uuid` |  Nullable |
| `updated_fields` | `jsonb` |  Nullable |
| `sale_type` | `text` |  Nullable |
| `trade_in_data` | `jsonb` |  Nullable |

## Table `sale_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `sale_id` | `int8` |  Nullable |
| `variant_id` | `int4` |  Nullable |
| `product_name` | `text` |  Nullable |
| `variant_name` | `text` |  Nullable |
| `color` | `text` |  Nullable |
| `storage` | `text` |  Nullable |
| `ram` | `text` |  Nullable |
| `usd_price` | `numeric` |  Nullable |
| `quantity` | `int4` |  Nullable |
| `subtotal_usd` | `numeric` |  Nullable |
| `subtotal_ars` | `numeric` |  Nullable |
| `imei` | `varchar` |  Nullable |
| `commission_pct` | `numeric` |  Nullable |
| `commission_fixed` | `numeric` |  Nullable |
| `cost_price_usd` | `numeric` |  Nullable |
| `is_gift` | `bool` |  |

## Table `sale_payments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `sale_id` | `int8` |  |
| `method` | `text` |  Nullable |
| `amount_ars` | `numeric` |  |
| `amount_usd` | `numeric` |  Nullable |
| `reference` | `text` |  Nullable |
| `card_brand` | `text` |  Nullable |
| `installments` | `int4` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `payment_method_id` | `int4` |  Nullable |
| `account_id` | `int8` |  Nullable |

## Table `sale_item_imeis`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `sale_item_id` | `int4` |  |
| `imei` | `text` |  |
| `created_at` | `timestamp` |  Nullable |
| `inventory_unit_id` | `int8` |  Nullable |

## Table `sales_channels`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary Identity |
| `name` | `text` |  Unique |
| `description` | `text` |  Nullable |
| `is_active` | `bool` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `accounts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `name` | `text` |  |
| `currency` | `text` |  |
| `initial_balance` | `numeric` |  |
| `notes` | `text` |  Nullable |
| `include_in_balance` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `is_reference_capital` | `bool` |  |
| `is_caja_virtual` | `bool` |  |
| `is_efectivo` | `bool` |  |
| `active` | `bool` |  |

## Table `fixed_expenses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `name` | `text` |  |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `account_id` | `int8` |  Nullable |
| `category` | `text` |  Nullable |
| `due_day` | `int4` |  Nullable |
| `notes` | `text` |  Nullable |
| `is_active` | `bool` |  |
| `last_paid_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `expenses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `created_at` | `timestamptz` |  |
| `expense_date` | `date` |  |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `amount_ars` | `numeric` |  |
| `fx_rate_used` | `numeric` |  Nullable |
| `account_id` | `int8` |  Nullable |
| `category` | `text` |  Nullable |
| `type` | `text` |  |
| `notes` | `text` |  Nullable |
| `fixed_expense_id` | `int8` |  Nullable |
| `frequency_value` | `int4` |  Nullable |
| `frequency_unit` | `text` |  Nullable |
| `last_paid_at` | `timestamptz` |  Nullable |
| `is_active` | `bool` |  |

## Table `providers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `name` | `text` |  |
| `contact_name` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `city` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `is_active` | `bool` |  |
| `created_at` | `timestamptz` |  |

## Table `purchases`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `provider_id` | `int8` |  Nullable |
| `purchase_date` | `date` |  |
| `currency` | `text` |  |
| `total_amount` | `numeric` |  |
| `total_amount_ars` | `numeric` |  Nullable |
| `fx_rate_used` | `numeric` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `status` | `text` |  |
| `void_reason` | `text` |  Nullable |
| `voided_at` | `timestamptz` |  Nullable |

## Table `purchase_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary |
| `purchase_id` | `int8` |  Nullable |
| `variant_id` | `int4` |  Nullable |
| `quantity` | `int4` |  |
| `unit_cost` | `numeric` |  |
| `subtotal` | `numeric` |  |

## Table `finance_categories`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `name` | `text` |  |
| `type` | `text` |  |
| `is_active` | `bool` |  |
| `created_at` | `timestamptz` |  |

## Table `account_movements`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `created_at` | `timestamptz` |  |
| `movement_date` | `date` |  |
| `account_id` | `int8` |  |
| `type` | `text` |  |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `amount_ars` | `numeric` |  Nullable |
| `fx_rate_used` | `numeric` |  Nullable |
| `related_table` | `text` |  Nullable |
| `related_id` | `int8` |  Nullable |
| `notes` | `text` |  Nullable |
| `accreditation_status` | `text` |  |
| `available_on` | `date` |  Nullable |
| `operation_id` | `uuid` |  Nullable |

## Table `purchase_payments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `purchase_id` | `int8` |  |
| `account_id` | `int8` |  |
| `payment_method_id` | `int4` |  Nullable |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `amount_ars` | `numeric` |  Nullable |
| `fx_rate_used` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  |
| `notes` | `text` |  Nullable |

## Table `warranty_exchanges`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `sale_id` | `int8` |  |
| `sale_item_id` | `int8` |  |
| `original_variant_id` | `int4` |  Nullable |
| `original_imei` | `text` |  Nullable |
| `quantity` | `int4` |  |
| `returned_stock_bucket` | `text` |  |
| `replacement_variant_id` | `int4` |  |
| `replacement_imei` | `text` |  Nullable |
| `reason` | `text` |  |
| `notes` | `text` |  Nullable |
| `status` | `text` |  |
| `created_at` | `timestamptz` |  |
| `created_by` | `uuid` |  Nullable |
| `price_difference_usd` | `numeric` |  |
| `settlement_type` | `text` |  |
| `settlement_account_id` | `int8` |  Nullable |
| `settlement_payment_method_id` | `int4` |  Nullable |
| `settlement_currency` | `text` |  Nullable |
| `settlement_amount` | `numeric` |  Nullable |
| `settlement_amount_ars` | `numeric` |  Nullable |
| `settlement_fx_rate_used` | `numeric` |  Nullable |
| `settlement_installments` | `int4` |  Nullable |
| `settlement_multiplier` | `numeric` |  Nullable |
| `store_credit_usd` | `numeric` |  |
| `store_credit_amount_ars` | `numeric` |  Nullable |
| `original_inventory_unit_id` | `int8` |  Nullable |

## Table `aftersales_devices`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `variant_id` | `int4` |  |
| `sale_id` | `int8` |  Nullable |
| `warranty_exchange_id` | `int8` |  Nullable |
| `source_type` | `text` |  |
| `imei` | `text` |  Nullable |
| `quantity` | `int4` |  |
| `status` | `text` |  |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `created_by` | `uuid` |  Nullable |
| `include_in_stock_cost_balance` | `bool` |  |
| `sold_sale_id` | `int8` |  Nullable |
| `sold_at` | `timestamptz` |  Nullable |
| `inventory_unit_id` | `int8` |  Nullable |

## Table `warranty_exchange_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `warranty_exchange_id` | `int8` |  |
| `variant_id` | `int4` |  |
| `imei` | `text` |  Nullable |
| `quantity` | `int4` |  |
| `unit_price_usd` | `numeric` |  |
| `subtotal_usd` | `numeric` |  |
| `created_at` | `timestamptz` |  |
| `inventory_unit_id` | `int8` |  Nullable |

## Table `inventory_units`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `variant_id` | `int4` |  |
| `purchase_id` | `int8` |  Nullable |
| `purchase_item_id` | `int8` |  Nullable |
| `sale_id` | `int8` |  Nullable |
| `sale_item_id` | `int8` |  Nullable |
| `warranty_exchange_id` | `int8` |  Nullable |
| `identifier_value` | `text` |  |
| `identifier_normalized` | `text` |  Nullable |
| `status` | `text` |  |
| `received_at` | `timestamptz` |  |
| `sold_at` | `timestamptz` |  Nullable |
| `returned_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `created_by` | `uuid` |  Nullable |
| `updated_by` | `uuid` |  Nullable |

## Table `inventory_unit_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `inventory_unit_id` | `int8` |  |
| `event_type` | `text` |  |
| `from_status` | `text` |  Nullable |
| `to_status` | `text` |  Nullable |
| `related_table` | `text` |  Nullable |
| `related_id` | `int8` |  Nullable |
| `notes` | `text` |  Nullable |
| `payload` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
| `created_by` | `uuid` |  Nullable |

## Table `cash_registers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `user_id` | `uuid` |  |
| `register_date` | `date` |  |
| `status` | `text` |  |
| `currency` | `text` |  |
| `opening_amount` | `numeric` |  |
| `closed_amount` | `numeric` |  Nullable |
| `expected_amount` | `numeric` |  Nullable |
| `difference` | `numeric` |  Nullable |
| `opened_at` | `timestamptz` |  |
| `closed_at` | `timestamptz` |  Nullable |
| `distribution` | `jsonb` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `opening_amounts` | `jsonb` |  |
| `closed_amounts` | `jsonb` |  Nullable |
| `difference_per_currency` | `jsonb` |  Nullable |

## Table `cash_register_movements`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `cash_register_id` | `int8` |  |
| `type` | `text` |  |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `related_table` | `text` |  Nullable |
| `related_id` | `int8` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `payment_method_id` | `int4` |  Nullable |
| `payment_method_name` | `text` |  Nullable |
| `reference` | `text` |  Nullable |
| `multiplier` | `numeric` |  Nullable |
| `net_amount` | `numeric` |  Nullable |
| `accreditation_status` | `text` |  Nullable |
| `available_on` | `date` |  Nullable |
| `sale_payment_id` | `int8` |  Nullable |
| `account_id` | `int8` |  Nullable |
| `operation_id` | `uuid` |  Nullable |

## Table `order_reservations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `lead_id` | `int4` |  |
| `product_variant_id` | `int4` |  |
| `quantity` | `int4` |  |
| `status` | `text` |  |
| `reserved_at` | `timestamptz` |  |
| `expires_at` | `timestamptz` |  |
| `released_at` | `timestamptz` |  Nullable |
| `released_by` | `uuid` |  Nullable |
| `release_reason` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `inventory_unit_id` | `int8` |  Nullable |

## Table `order_deposits`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `lead_id` | `int4` |  |
| `sale_id` | `int8` |  Nullable |
| `customer_id` | `int4` |  Nullable |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `amount_ars` | `numeric` |  |
| `fx_rate_used` | `numeric` |  Nullable |
| `payment_method_id` | `int4` |  Nullable |
| `account_id` | `int8` |  Nullable |
| `reference` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `status` | `text` |  |
| `received_at` | `timestamptz` |  |
| `applied_at` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |

## RLS Policies

### `sales_channels`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `sales_channels_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `sales_channels_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `providers`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `providers_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | — |
| `providers_write_owner` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `finance_categories`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `finance_categories_owner_all` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `account_movements`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `account_movements_owner_all` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `expenses`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `expenses_owner_all` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `fixed_expenses`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `fixed_expenses_owner_all` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `inventory_units`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `inventory_units_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin() OR is_seller())` | — |
| `inventory_units_write_roles` | ALL | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | `(is_owner() OR is_superadmin())` |

### `inventory_unit_events`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `inventory_unit_events_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin() OR is_seller())` | — |
| `inventory_unit_events_insert_roles` | INSERT | authenticated | PERMISSIVE | — | `(is_owner() OR is_superadmin())` |

### `purchases`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `purchases_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | — |
| `purchases_write_owner` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `purchase_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `purchase_items_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | — |
| `purchase_items_write_owner` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `sale_payments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `sale_payments_select_if_parent_visible` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM sales s   WHERE ((s.id = sale_payments.sale_id) AND (is_admin_like() OR (s.seller_id = auth.uid())))))` | — |
| `sale_payments_insert_adminlike` | INSERT | authenticated | PERMISSIVE | — | `(is_admin_like() AND (EXISTS ( SELECT 1    FROM sales s   WHERE (s.id = sale_payments.sale_id))))` |
| `sale_payments_update_owner` | UPDATE | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |
| `sale_payments_delete_owner` | DELETE | authenticated | PERMISSIVE | `is_owner()` | — |

### `purchase_payments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `purchase_payments_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | — |
| `purchase_payments_write_owner` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `aftersales_devices`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `aftersales_devices_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | — |
| `aftersales_devices_write_roles` | ALL | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | `(is_owner() OR is_superadmin())` |

### `warranty_exchanges`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `warranty_exchanges_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | — |
| `warranty_exchanges_write_roles` | ALL | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin())` | `(is_owner() OR is_superadmin())` |

### `warranty_exchange_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `warranty_exchange_items_select_roles` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM warranty_exchanges we   WHERE ((we.id = warranty_exchange_items.warranty_exchange_id) AND (is_owner() OR is_superadmin()))))` | — |
| `warranty_exchange_items_write_roles` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM warranty_exchanges we   WHERE ((we.id = warranty_exchange_items.warranty_exchange_id) AND (is_owner() OR is_superadmin()))))` | `(EXISTS ( SELECT 1    FROM warranty_exchanges we   WHERE ((we.id = warranty_exchange_items.warranty_exchange_id) AND (is_owner() OR is_superadmin()))))` |

### `customers`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `customers_insert_auth` | INSERT | authenticated | PERMISSIVE | — | `true` |
| `customers_update_adminlike` | UPDATE | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |
| `customers_delete_adminlike` | DELETE | authenticated | PERMISSIVE | `is_admin_like()` | — |
| `customers_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `accounts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `accounts_write_owner` | ALL | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |
| `accounts_select_roles` | SELECT | authenticated | PERMISSIVE | `(is_owner() OR is_superadmin() OR is_seller())` | — |

### `user_roles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `user_roles_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `user_roles_insert_owner` | INSERT | authenticated | PERMISSIVE | — | `is_owner()` |
| `user_roles_update_owner` | UPDATE | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |
| `user_roles_delete_owner` | DELETE | authenticated | PERMISSIVE | `is_owner()` | — |

### `sale_item_imeis`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `sale_item_imeis_delete_owner` | DELETE | authenticated | PERMISSIVE | `is_owner()` | — |
| `sale_item_imeis_select_if_parent_visible` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (sale_items si      JOIN sales s ON ((s.id = si.sale_id)))   WHERE ((si.id = sale_item_imeis.sale_item_id) AND (is_admin_like() OR (s.seller_id = auth.uid())))))` | — |
| `sale_item_imeis_insert_adminlike` | INSERT | authenticated | PERMISSIVE | — | `(is_admin_like() AND (EXISTS ( SELECT 1    FROM sale_items si   WHERE (si.id = sale_item_imeis.sale_item_id))))` |
| `sale_item_imeis_update_owner` | UPDATE | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `cash_registers`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `cash_registers_select_admin` | SELECT | authenticated | PERMISSIVE | `is_admin_like()` | — |
| `cash_registers_insert_admin` | INSERT | authenticated | PERMISSIVE | — | `is_admin_like()` |
| `cash_registers_update_admin` | UPDATE | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `cash_register_movements`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `cash_movements_select_admin` | SELECT | authenticated | PERMISSIVE | `is_admin_like()` | — |
| `cash_movements_insert_admin` | INSERT | authenticated | PERMISSIVE | — | `is_admin_like()` |

### `commission_payments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `commission_payments_select_adminlike` | SELECT | authenticated | PERMISSIVE | `is_admin_like()` | — |
| `commission_payments_select_own_seller` | SELECT | authenticated | PERMISSIVE | `(seller_id = auth.uid())` | — |
| `commission_payments_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `order_reservations`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `order_reservations_authenticated_select` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `order_deposits`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `order_deposits_authenticated_select` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `users`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `users_select_own` | SELECT | authenticated | PERMISSIVE | `(id_auth = auth.uid())` | — |
| `users_update_own` | UPDATE | authenticated | PERMISSIVE | `(id_auth = auth.uid())` | `(id_auth = auth.uid())` |
| `users_select_superadmin_all` | SELECT | authenticated | PERMISSIVE | `is_superadmin()` | — |
| `users_select_owner_all` | SELECT | authenticated | PERMISSIVE | `is_owner()` | — |
| `users_update_owner_all` | UPDATE | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |

### `brands`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `brands_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `brands_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `categories`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `categories_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `categories_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `products`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `products_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `products_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `product_variants`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `variants_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `variants_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `fx_rates`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `fx_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `fx_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `commission_rules`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `commission_rules_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `commission_rules_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `payment_methods`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `payment_methods_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `payment_methods_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `payment_installments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `installments_select_auth` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `installments_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `leads`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `leads_select_adminlike` | SELECT | authenticated | PERMISSIVE | `is_admin_like()` | — |
| `leads_select_own_seller` | SELECT | authenticated | PERMISSIVE | `(referred_by = auth.uid())` | — |
| `leads_insert_own_seller` | INSERT | authenticated | PERMISSIVE | — | `(referred_by = auth.uid())` |
| `leads_update_own_seller` | UPDATE | authenticated | PERMISSIVE | `(referred_by = auth.uid())` | `(referred_by = auth.uid())` |
| `leads_write_adminlike` | ALL | authenticated | PERMISSIVE | `is_admin_like()` | `is_admin_like()` |

### `sales`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `sales_select_adminlike` | SELECT | authenticated | PERMISSIVE | `is_admin_like()` | — |
| `sales_select_own_seller` | SELECT | authenticated | PERMISSIVE | `(seller_id = auth.uid())` | — |
| `sales_insert_adminlike` | INSERT | authenticated | PERMISSIVE | — | `is_admin_like()` |
| `sales_update_owner` | UPDATE | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |
| `sales_delete_owner` | DELETE | authenticated | PERMISSIVE | `is_owner()` | — |

### `sale_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `sale_items_select_if_parent_visible` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM sales s   WHERE ((s.id = sale_items.sale_id) AND (is_admin_like() OR (s.seller_id = auth.uid())))))` | — |
| `sale_items_insert_adminlike` | INSERT | authenticated | PERMISSIVE | — | `(is_admin_like() AND (EXISTS ( SELECT 1    FROM sales s   WHERE (s.id = sale_items.sale_id))))` |
| `sale_items_update_owner` | UPDATE | authenticated | PERMISSIVE | `is_owner()` | `is_owner()` |
| `sale_items_delete_owner` | DELETE | authenticated | PERMISSIVE | `is_owner()` | — |

