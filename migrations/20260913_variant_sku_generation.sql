-- ============================================================
-- SKU auto-generado para variantes de producto
-- ============================================================
-- Problema: las variantes solo se identifican por variant_name
-- (ej: "256GB / 8GB"), que es ambiguo entre productos similares
-- (fundas del mismo modelo con distinto dibujo, etc).
--
-- Solucion: cada variante recibe un SKU unico, legible y estable,
-- apto para imprimir como codigo de barras y escanear con pistola
-- lectora desde el registro de venta.
--
-- Formato: {CAT}-{PRODUCTO}-{SPECS}-{COLOR}-{SEQ}
-- Ejemplos: CEL-IPH-256-8B-NEG-001
--           ACC-FUN-IPH-16P-NEG-003
--
-- El sufijo secuencial garantiza unicidad absoluta: la parte
-- descriptiva es solo una ayuda visual para el vendedor.

-- 1) Columnas e indices
-- ============================================================

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS sku text;

-- Codigo EAN/UPC de proveedor (opcional). Se escanea igual que el SKU.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS barcode text;

-- UNIQUE permite multiples NULLs en Postgres, asi que las variantes
-- sin SKU no entran en conflicto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_variants_sku_key'
      AND conrelid = 'public.product_variants'::regclass
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_sku_key UNIQUE (sku);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_variants_sku
  ON public.product_variants (sku);

CREATE INDEX IF NOT EXISTS idx_product_variants_barcode
  ON public.product_variants (barcode);


-- 2) Normalizador de texto
-- ============================================================
-- "Funda iPhone 16 Pro" -> "FUNDAIPHONE16PRO"
-- Se usa translate() en vez de la extension unaccent para no
-- depender de modulos que puedan no estar habilitados.

CREATE OR REPLACE FUNCTION public.fn_sku_clean(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT coalesce(
    regexp_replace(
      translate(
        upper(coalesce(p_text, '')),
        'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕØÚÙÛÜÑÇÝŸ',
        'AAAAAAEEEEIIIIOOOOOOUUUUNCYY'
      ),
      '[^A-Z0-9]', '', 'g'
    ),
    ''
  );
$function$;


-- 3) Constructor de SKU (logica central)
-- ============================================================
-- Recibe los campos crudos para poder usarse tanto desde el
-- trigger BEFORE INSERT (aun no hay id) como desde el backfill
-- de variantes ya existentes.

CREATE OR REPLACE FUNCTION public.fn_build_variant_sku(
  p_product_id          integer,
  p_variant_name        text,
  p_color               text,
  p_storage             text,
  p_storage_capacity    text,
  p_ram                 text,
  p_exclude_variant_id  integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_name  text;
  v_category_name text;
  v_prefix        text;
  v_product_code  text;
  v_color_code    text;
  v_specs         text;
  v_storage       text;
  v_ram           text;
  v_tokens        text[];
  v_base          text;
  v_seq           integer := 1;
  v_sku           text;
  i               integer;
BEGIN
  SELECT p.name, c.name
    INTO v_product_name, v_category_name
  FROM public.products p
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado', p_product_id;
  END IF;

  -- 3.1) Prefijo de categoria
  v_prefix := CASE lower(coalesce(v_category_name, ''))
    WHEN 'celulares'    THEN 'CEL'
    WHEN 'tablets'      THEN 'TAB'
    WHEN 'notebooks'    THEN 'NOT'
    WHEN 'auriculares'  THEN 'AUR'
    WHEN 'accesorios'   THEN 'ACC'
    WHEN 'smartwatches' THEN 'SWA'
    WHEN 'monitores'    THEN 'MON'
    WHEN 'teclados'     THEN 'TEC'
    WHEN 'mouses'       THEN 'MOU'
    WHEN 'parlantes'    THEN 'PAR'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    v_prefix := left(public.fn_sku_clean(v_category_name), 3);
  END IF;
  IF coalesce(v_prefix, '') = '' THEN
    v_prefix := 'OTR';
  END IF;

  -- 3.2) Codigo de producto (3 caracteres)
  v_product_code := left(public.fn_sku_clean(v_product_name), 3);
  IF v_product_code = '' THEN
    v_product_code := 'PRD';
  END IF;

  -- 3.3) Specs: capacidad + RAM. Si no aplican (fundas, accesorios)
  --      se derivan del variant_name para diferenciar modelos.
  v_storage := regexp_replace(
    coalesce(p_storage_capacity, p_storage, ''), '[^0-9]', '', 'g'
  );
  v_ram := regexp_replace(coalesce(p_ram, ''), '[^0-9]', '', 'g');

  IF v_storage <> '' AND v_ram <> '' THEN
    v_specs := v_storage || '-' || v_ram || 'B';
  ELSIF v_storage <> '' THEN
    v_specs := v_storage;
  ELSIF v_ram <> '' THEN
    v_specs := v_ram || 'B';
  ELSE
    v_specs := '';
    v_tokens := regexp_split_to_array(
      public.fn_sku_clean(p_variant_name), '[^A-Z0-9]+'
    );
    FOR i IN 1..least(2, coalesce(array_length(v_tokens, 1), 0)) LOOP
      IF v_tokens[i] <> '' THEN
        v_specs := v_specs
                   || CASE WHEN v_specs <> '' THEN '-' ELSE '' END
                   || left(v_tokens[i], 3);
      END IF;
    END LOOP;
  END IF;

  -- 3.4) Color (3 caracteres)
  v_color_code := left(public.fn_sku_clean(p_color), 3);

  -- 3.5) Base del SKU, descartando partes vacias
  v_base := v_prefix || '-' || v_product_code;
  IF v_specs <> '' THEN
    v_base := v_base || '-' || v_specs;
  END IF;
  IF v_color_code <> '' THEN
    v_base := v_base || '-' || v_color_code;
  END IF;

  -- 3.6) Secuencial de 3 digitos: garantiza unicidad.
  --      OJO: lpad() TRUNCA si el texto es mas largo que el ancho pedido
  --      (lpad('1000',3,'0') = '100'), asi que a partir de 1000 se usa el
  --      numero sin rellenar para no generar colisiones.
  LOOP
    v_sku := v_base || '-' ||
      CASE WHEN v_seq < 1000 THEN lpad(v_seq::text, 3, '0') ELSE v_seq::text END;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE sku = v_sku
        AND (p_exclude_variant_id IS NULL OR id <> p_exclude_variant_id)
    );

    v_seq := v_seq + 1;

    IF v_seq > 100000 THEN
      RAISE EXCEPTION
        'No se pudo generar un SKU unico para la base %', v_base;
    END IF;
  END LOOP;

  RETURN v_sku;
END;
$function$;


-- 4) Generador por variant_id (uso manual / backfill)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_generate_variant_sku(p_variant_id integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v record;
BEGIN
  SELECT pv.product_id, pv.variant_name, pv.color, pv.storage,
         pv.storage_capacity, pv.ram
    INTO v
  FROM public.product_variants pv
  WHERE pv.id = p_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante % no encontrada', p_variant_id;
  END IF;

  RETURN public.fn_build_variant_sku(
    v.product_id, v.variant_name, v.color,
    v.storage, v.storage_capacity, v.ram, p_variant_id
  );
END;
$function$;


-- 5) Trigger: SKU automatico al crear variantes
-- ============================================================
-- Toda variante insertada sin SKU recibe uno automaticamente.
-- El frontend no necesita hacer nada extra al guardar.

CREATE OR REPLACE FUNCTION public.fn_product_variants_ensure_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(btrim(NEW.sku), '') = '' THEN
    NEW.sku := public.fn_build_variant_sku(
      NEW.product_id, NEW.variant_name, NEW.color,
      NEW.storage, NEW.storage_capacity, NEW.ram, NULL
    );
  ELSE
    NEW.sku := btrim(upper(NEW.sku));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_product_variants_ensure_sku
  ON public.product_variants;

CREATE TRIGGER trg_product_variants_ensure_sku
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_product_variants_ensure_sku();


-- 6) RPC: asignar SKU a las variantes de un producto
-- ============================================================
-- Se usa para el backfill y para regenerar SKUs faltantes luego
-- de una edicion masiva desde DialogVariants.

CREATE OR REPLACE FUNCTION public.rpc_generate_skus_for_product(p_product_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row     record;
  v_new_sku text;
  v_count   integer := 0;
BEGIN
  FOR v_row IN
    SELECT id
    FROM public.product_variants
    WHERE product_id = p_product_id
      AND coalesce(btrim(sku), '') = ''
    ORDER BY id
  LOOP
    v_new_sku := public.fn_generate_variant_sku(v_row.id);

    UPDATE public.product_variants
    SET sku = v_new_sku, updated_at = now()
    WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', p_product_id,
    'generated', v_count
  );
END;
$function$;


-- 7) RPC: backfill global (todas las variantes sin SKU)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_generate_skus_backfill_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row     record;
  v_new_sku text;
  v_count   integer := 0;
  v_errors  integer := 0;
BEGIN
  FOR v_row IN
    SELECT id
    FROM public.product_variants
    WHERE coalesce(btrim(sku), '') = ''
    ORDER BY product_id, id
  LOOP
    BEGIN
      v_new_sku := public.fn_generate_variant_sku(v_row.id);

      UPDATE public.product_variants
      SET sku = v_new_sku, updated_at = now()
      WHERE id = v_row.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'generated', v_count,
    'errors', v_errors
  );
END;
$function$;


-- 8) Permisos
-- ============================================================

GRANT EXECUTE ON FUNCTION public.fn_sku_clean(text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_build_variant_sku(
  integer, text, text, text, text, text, integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_generate_variant_sku(integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_generate_skus_for_product(integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_generate_skus_backfill_all() TO authenticated;
