import { useCallback, useEffect, useMemo, useState } from "react";
// ❌ ELIMINADO: import Swal from "sweetalert2";
// ✅ AGREGADO: Sonner para notificaciones
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";
import { Switch } from "@/components/ui/switch";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DialogVariants from "../components/DialogVariants";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ProductDetailDialog from "../components/ProductDetailDialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconCreditCard,
  IconEdit,
  IconHomeDollar,
  IconRefresh,
  IconTrash,
  IconPlus,
  IconInfoCircle,
  IconVersions,
} from "@tabler/icons-react";
import DialogProduct from "../components/DialogProduct";

// ✅ AGREGADO: Componente de diálogo de confirmación (asumiendo su existencia)
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// import { de } from "date-fns/locale/de";

const TABLE_COLUMNS = [
  { id: "image", label: "Imagen" },
  { id: "name", label: "Producto" },
  { id: "brand", label: "Marca" },
  { id: "stock", label: "Stock" },
  // { id: "usd_price", label: "Precio USD" },
  // { id: "cash_price", label: "Efec/Transf" },
  // { id: "payment_methods", label: "Métodos de pago" },
  { id: "active", label: "Activo" },
  { id: "commission", label: "Comisión" },
  { id: "actions", label: "Acciones" },
];

const DEFAULT_FX_RATE = "cargando...";
const PLACEHOLDER_IMAGE = "https://via.placeholder.com/80?text=Producto";

const currencyFormatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
const currencyFormatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const percentageFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
});

const formatCurrencyARS = (v) =>
  v == null || Number.isNaN(Number(v)) ? "-" : currencyFormatterARS.format(v);
const formatCurrencyUSD = (v) =>
  v == null || Number.isNaN(Number(v)) ? "-" : currencyFormatterUSD.format(v);
const formatPercentage = (v) =>
  v == null || Number.isNaN(Number(v))
    ? "-"
    : percentageFormatter.format(v) + "%";

const getProductInitials = (name) => {
  if (!name) return "PR";
  const parts = name.split(" ").filter(Boolean);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[1][0]).toUpperCase();
};

const ProductsTable = ({ refreshToken = 0, isSellerView = false }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [rateDiff, setRateDiff] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const [openVariants, setOpenVariants] = useState(false);
  const [selectedVariantProduct, setSelectedVariantProduct] = useState(null);

  const [paymentInstallments, setPaymentInstallments] = useState([]);
  const [productDialog, setProductDialog] = useState({
    open: false,
    product: null,
  });

  // 🔄 REEMPLAZO 2: Estado para el AlertDialog de eliminación
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    product: null,
  });

  // Estado para ordenamiento de columnas
  const [sortBy, setSortBy] = useState(null); // id de columna
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  const handleSortChange = useCallback(
    (col) => {
      setSortBy((current) => {
        if (current !== col) {
          setSortDir("asc");
          return col;
        }

        // mismo encabezado: ciclo asc -> desc -> sin orden
        if (sortDir === "asc") {
          setSortDir("desc");
          return current;
        }

        // si ya estaba en desc, quitar orden (volver al default)
        setSortDir("asc");
        return null;
      });
    },
    [sortDir]
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchProducts = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    else setRefreshing(true);

    try {
      let brandIds = [];
      if (debouncedSearch) {
        const { data: brandMatches } = await supabase
          .from("brands")
          .select("id")
          .ilike("name", `%${debouncedSearch}%`);
        brandIds = (brandMatches || []).map((b) => b.id);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let productsQuery = supabase
        .from("products")
        .select(
          `
             id,
             name,
             brand_id,
             category_id,
             usd_price,
             commission_pct,
             commission_fixed,
             cover_image_url,
             inventory_tracking_mode,
             allow_backorder,
             lead_time_label,
             deposit_amount,
             active,
             brands (id, name),
             categories (id, name),
             product_variants (
                id,
                storage,
                ram,
                color,
                usd_price,
                cost_price_usd,
                stock,
                active,
                image_url,
                variant_name,
                processor,
                graphics_card,
                screen_size,
                resolution,
                storage_type,
                storage_capacity,
                ram_type,
                ram_frequency,
                battery,
                weight,
                operating_system,
                camera_main,
                camera_front
              )
           `,
          { count: "exact" }
        )
        .order("active", { ascending: false })
        .order("name")
        .range(from, to);

      if (isSellerView) {
        productsQuery = productsQuery.eq("active", true);
      }
      if (!isSellerView && statusFilter !== "all") {
        productsQuery = productsQuery.eq("active", statusFilter === "active");
      }
      if (selectedBrand) {
        productsQuery = productsQuery.eq("brand_id", Number(selectedBrand));
      }
      if (selectedCategory) {
        productsQuery = productsQuery.eq("category_id", Number(selectedCategory));
      }
      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        if (brandIds.length) {
          productsQuery = productsQuery.or(
            `name.ilike.${term},brand_id.in.(${brandIds.join(",")})`
          );
        } else {
          productsQuery = productsQuery.ilike("name", term);
        }
      }

      const [
        fxRatesRes,
        productsRes,
        paymentMethodsRes,
        brandsRes,
        categoriesRes,
        commissionRulesRes,
      ] = await Promise.all([
        supabase
          .from("fx_rates")
          .select("id, source, rate, is_active, created_at")
          .eq("source", "blue"),
        productsQuery,
        supabase
          .from("payment_methods")
          .select(
            "id, name, multiplier, is_active, payment_installments(id, installments, multiplier, description, payment_method_id)"
          )
          .order("id"),
        supabase.from("brands").select("id, name").order("name"),
        supabase.from("categories").select("id, name").order("name"),
        supabase
          .from("commission_rules")
          .select(
            "id, category_id, brand_id, commission_pct, commission_fixed, priority"
          )
          .order("priority"),
      ]);

      const fxActive = fxRatesRes?.data?.find((r) => r.is_active);
      const currentFxRate = fxActive ? Number(fxActive.rate) : DEFAULT_FX_RATE;

      // calcular última actualización y diferencia respecto a la anterior (si existe)
      let lastUpdateLocal = null;
      let rateDiffLocal = null;
      if (fxActive) {
        lastUpdateLocal = fxActive.created_at ? new Date(fxActive.created_at) : null;

        const { data: fxPrev, error: fxPrevError } = await supabase
          .from("fx_rates")
          .select("rate")
          .eq("source", fxActive.source)
          .eq("is_active", false)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!fxPrevError && fxPrev && fxPrev.length > 0) {
          const prev = fxPrev[0];
          rateDiffLocal =
            ((Number(fxActive.rate) - Number(prev.rate)) / Number(prev.rate)) * 100;
        }
      }

      const rules = commissionRulesRes?.data || [];
      setTotalCount(productsRes?.count ?? 0);
      const methodsRaw = paymentMethodsRes?.data || [];

      // 🔹 Separar métodos e installments
      const flatInstallments = methodsRaw.flatMap(
        (m) => m.payment_installments || []
      );
      const methods = methodsRaw.map(
        ({ payment_installments, ...rest }) => rest
      );

      const filteredMethods = methods.filter(
        (m) =>
          !m.name.toLowerCase().includes("efectivo") &&
          !m.name.toLowerCase().includes("transfer")
      );

      const getCommissionForProduct = (p) => {
        if (p.commission_pct !== null || p.commission_fixed !== null) {
          return {
            pct: p.commission_pct,
            fixed: p.commission_fixed,
            ruleName: "Propia",
            priority: 0,
          };
        }

        const applicable = rules.filter(
          (r) =>
            (r.brand_id && r.brand_id === p.brand_id) ||
            (r.category_id && r.category_id === p.category_id)
        );

        if (applicable.length === 0)
          return {
            pct: null,
            fixed: null,
            ruleName: "No tiene",
            priority: null,
          };

        const bestRule = applicable.reduce((a, b) =>
          a.priority < b.priority ? a : b
        );

        return {
          pct: bestRule.commission_pct,
          fixed: bestRule.commission_fixed,
          ruleName: bestRule.brand_id ? `Por Marca` : `Por Categoría`,
          priority: bestRule.priority,
        };
      };

      const processed = (productsRes?.data || []).map((p) => {
        const commission = getCommissionForProduct(p);
        const variants = p.product_variants || [];
        const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        const minVariantPrice = Math.min(
          ...variants.map((v) => Number(v.usd_price || p.usd_price))
        );

        return {
          id: p.id,
          name: p.name,
          brand_id: p.brand_id,
          category_id: p.category_id,
          brandName: p.brands?.name ?? "Sin marca",
          categoryName: p.categories?.name ?? "Sin categoría",
          stock: totalStock,
          usdPrice: minVariantPrice,
          commissionPct: commission.pct ?? null,
          commissionFixed: commission.fixed ?? null,
          commissionRuleName: commission.ruleName,
          priority: commission.priority,
          coverImageUrl:
            p.cover_image_url || variants[0]?.image_url || PLACEHOLDER_IMAGE,
          inventoryTrackingMode: p.inventory_tracking_mode || "quantity",
          allowBackorder: p.allow_backorder,
          leadTimeLabel: p.lead_time_label,
          depositAmount: p.deposit_amount,
          active: p.active,
          variants,
        };
      });

      setFxRate(currentFxRate);
      setLastUpdate(lastUpdateLocal);
      setRateDiff(rateDiffLocal);
      setProducts(processed);
      setBrands(brandsRes?.data || []);
      setCategories(categoriesRes?.data || []);
      setPaymentMethods(filteredMethods);
      setPaymentInstallments(flatInstallments);
    } catch (err) {
      console.error(err);
      // 🔄 REEMPLAZO 3: Reemplazar Swal por toast
      toast.error("Error al cargar los productos", {
        description:
          err.message || "Ocurrió un error desconocido al cargar datos.",
      });
      // ❌ ELIMINADO: Swal.fire("Error", "No se pudieron cargar los productos", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    debouncedSearch,
    isSellerView,
    page,
    selectedBrand,
    selectedCategory,
    statusFilter,
  ]);

  const handleToggleActive = useCallback(
    async (product) => {
      try {
        setRefreshing(true);

        const { error } = await supabase
          .from("products")
          .update({ active: !product.active })
          .eq("id", product.id);

        if (error) throw error;

        await fetchProducts(false);

        toast.success("Estado actualizado", {
          description: `${product.name} ahora está ${
            !product.active ? "activo" : "inactivo"
          }.`,
        });
      } catch (error) {
        console.error(error);
        toast.error("No se pudo actualizar el estado", {
          description: error.message,
        });
      } finally {
        setRefreshing(false);
      }
    },
    [fetchProducts]
  );

  useEffect(() => {
    fetchProducts(refreshToken === 0);
  }, [fetchProducts, refreshToken]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    selectedBrand,
    selectedCategory,
    statusFilter,
    refreshToken,
    isSellerView,
  ]);

  const handleRefresh = () => fetchProducts(false);

  // 🔄 REEMPLAZO 4: Función para manejar la apertura del diálogo de eliminación
  const handleOpenDeleteDialog = (product) => {
    setDeleteDialog({ open: true, product });
  };

  // Función que ejecuta la eliminación del producto
  const handleConfirmDelete = async () => {
    if (!deleteDialog.product) return;

    try {
      // Primero eliminamos las variantes del producto
      const { error: variantsError } = await supabase
        .from("product_variants")
        .delete()
        .eq("product_id", deleteDialog.product.id);

      if (variantsError) throw variantsError;

      // Luego eliminamos el producto
      const { error: productError } = await supabase
        .from("products")
        .delete()
        .eq("id", deleteDialog.product.id);

      if (productError) throw productError;

      toast.success("Producto eliminado", {
        description: `${deleteDialog.product.name} fue eliminado correctamente.`,
      });

      // Refrescar la tabla
      fetchProducts();
    } catch (error) {
      console.error("Error al eliminar:", error);
      toast.error("Error al eliminar", {
        description:
          "No se pudo eliminar el producto. Por favor, intenta nuevamente.",
      });
    } finally {
      // Cerrar el diálogo
      setDeleteDialog({ open: false, product: null });
    }
  };
  // FIN REEMPLAZO 5

  const filteredProducts = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const compareValues = (a, b, col) => {
      if (col === "name") return a.name.localeCompare(b.name) * dir;
      if (col === "brand") return a.brandName.localeCompare(b.brandName) * dir;
      if (col === "stock") return (Number(a.stock) - Number(b.stock)) * dir;
      if (col === "commission") {
        const va = a.commissionPct ?? a.commissionFixed ?? 0;
        const vb = b.commissionPct ?? b.commissionFixed ?? 0;
        return (Number(va) - Number(vb)) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    };

    return products.slice().sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (sortBy) return compareValues(a, b, sortBy);
      return a.name.localeCompare(b.name);
    });
  }, [products, sortBy, sortDir]);

  const getRateBadge = () => {
    if (rateDiff === null) return null;
    const diffAbs = Math.abs(rateDiff).toFixed(2);
    if (rateDiff > 0)
      return (
        <Badge variant="outline" className="text-green-600">
          ▲ +{diffAbs}%
        </Badge>
      );
    if (rateDiff < 0)
      return (
        <Badge variant="outline" className="text-red-600">
          ▼ {diffAbs}%
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-gray-600">
        = 0%
      </Badge>
    );
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <TooltipProvider>
      <div className="gap-4">
        {isSellerView && (
          <div className="flex flex-col gap-4 mb-4">
            <Card className="flex-1 flex flex-col justify-between relative">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <IconHomeDollar className="text-green-500" />
                  Cotización actual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold flex items-center gap-3">
                  {fxRate ? `$${fxRate.toLocaleString("es-AR")}` : "-"}
                  {getRateBadge()}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  USD → ARS
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Última actualización: {formatDate(lastUpdate)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* 🔹 Filtros y acciones (SIN CAMBIOS) */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* 🟩 FILA 1 (sm–lg: full width, xl: queda a la izquierda) */}
          <Input
            placeholder="Buscar por producto o marca..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full xl:w-80"
          />

          {/* Contenedor de filtros + botones (stack en sm–lg, inline en xl) */}
          <div className="flex flex-col gap-3 w-full xl:flex-row xl:items-center xl:justify-end">
            {/* 🟦 FILA 2 — Filtros (marca + categoría) */}
            <div className="flex flex-wrap gap-2 justify-end w-full">
              <Select
                value={selectedBrand || "all"}
                onValueChange={(v) => setSelectedBrand(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-full md:w-auto min-w-[180px]">
                  <SelectValue placeholder="Todas las marcas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las marcas</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedCategory || "all"}
                onValueChange={(v) => setSelectedCategory(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-full md:w-auto min-w-[180px]">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSellerView && (
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v)}
                >
                  <SelectTrigger className="w-full md:w-auto min-w-[180px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 🟨 FILA 3 — Botones (sm–lg alineados al final, xl también pero en la misma fila única) */}
            <div
              className="
        flex flex-row gap-2 justify-end
        w-full xl:w-auto
      "
            >
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1"
              >
                <IconRefresh
                  className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
                <span className="sm:inline">Refrescar</span>
              </Button>

              {!isSellerView && (
                <Button
                  onClick={() =>
                    setProductDialog({ open: true, product: null })
                  }
                  className="flex items-center gap-1"
                >
                  <IconPlus className="h-4 w-4" />
                  <span className="sm:inline">Agregar</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 🔹 NUEVO: Vista tipo CARD para móviles */}
        <div className="mt-2 block md:hidden">
          {loading ? (
            <div className="grid gap-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground text-sm">
              No hay productos que coincidan con el filtro.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="group flex flex-col justify-between rounded-xl border bg-card p-3 shadow-sm transition hover:shadow-md"
                  onClick={() => setSelectedProduct(p)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={p.coverImageUrl} alt={p.name} />
                      <AvatarFallback>
                        {getProductInitials(p.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-medium leading-tight">{p.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {p.brandName} • {p.categoryName}
                      </p>
                      <div className="mt-1">
                        <Badge
                          variant="secondary"
                          className={
                            p.inventoryTrackingMode === "serial"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                              : ""
                          }
                        >
                          {p.inventoryTrackingMode === "serial"
                            ? "Serializado"
                            : "Por cantidad"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Stock:{" "}
                      {p.stock === 0 && p.allowBackorder ? (
                        <span className="text-amber-600 font-medium">
                          Pedido {p.leadTimeLabel}
                        </span>
                      ) : (
                        p.stock
                      )}
                    </span>

                    {!p.active && (
                      <span className="text-xs text-red-600 font-medium uppercase">
                        Inactivo
                      </span>
                    )}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">
                            Comisión:
                          </span>
                          <span className=" font-medium">
                            {p.commissionPct
                              ? formatPercentage(p.commissionPct)
                              : p.commissionFixed
                              ? formatCurrencyUSD(p.commissionFixed)
                              : "-"}
                          </span>
                          <IconInfoCircle className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{p.commissionRuleName}</p>
                        {/* <span>Prioridad: {p.priority}</span> */}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* 🔹 Acciones dentro de la card (solo admin) */}
                  {!isSellerView && (
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="p-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProductDialog({ open: true, product: p });
                        }}
                      >
                        <IconEdit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="p-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVariantProduct(p);
                          setOpenVariants(true);
                        }}
                      >
                        <IconVersions className="h-4 w-4" />
                      </Button>
                      {/* <Button
                        size="icon"
                        variant="destructive"
                        className="p-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDeleteDialog(p);
                        }}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button> */}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 🔹 Tabla original SOLO visible en escritorio */}
        <div className="mt-4 hidden md:block overflow-x-auto rounded-md border">
          <Table className="min-w-full text-sm">
            <TableHeader>
              <TableRow>
                {TABLE_COLUMNS.filter(
                  (c) =>
                    !(
                      (isSellerView && c.id === "actions") &&
                      c.id === "active"
                    ) && c.id !== "usd_price" // ❌ se elimina la columna de precio
                ).map((c) => (
                  <TableHead key={c.id}>
                    {c.id === "actions" || c.id === "image" ? (
                      c.label
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange(c.id);
                        }}
                        className="flex items-center gap-1 cursor-pointer"
                      >
                        <span>{c.label}</span>
                        {sortBy === c.id && (
                          <span aria-hidden className="text-xs">
                            {sortDir === "asc" ? " ▲" : " ▼"}
                          </span>
                        )}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMNS.length}>
                    <div className="grid gap-2">
                      {[...Array(10)].map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TABLE_COLUMNS.length}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No hay productos que coincidan con el filtro.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50 transition"
                    onClick={() => setSelectedProduct(p)}
                  >
                    <TableCell>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={p.coverImageUrl} alt={p.name} />
                        <AvatarFallback>
                          {getProductInitials(p.name)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>

                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <p className="text-xs text-muted-foreground">
                        {p.categoryName}
                      </p>
                      <div className="mt-1">
                        <Badge
                          variant="secondary"
                          className={
                            p.inventoryTrackingMode === "serial"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                              : ""
                          }
                        >
                          {p.inventoryTrackingMode === "serial"
                            ? "Serializado"
                            : "Por cantidad"}
                        </Badge>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">{p.brandName}</Badge>
                    </TableCell>

                    <TableCell>
                      {p.stock === 0 && p.allowBackorder ? (
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium text-amber-600">
                            Pedido
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {p.leadTimeLabel || "Sin plazo"}
                          </span>
                        </div>
                      ) : (
                        p.stock
                      )}
                    </TableCell>

                    {/* 🆕 Columna Activo */}
                    {!isSellerView && (
                      <TableCell>
                        <Switch
                          onClick={(e) => e.stopPropagation()}
                          checked={Boolean(p.active)}
                          onCheckedChange={() => handleToggleActive(p)}
                          aria-label={"Cambiar estado de " + p.name}
                        />
                      </TableCell>
                    )}

                    {/* ❌ Se elimina el precio USD y ARS */}
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <span>
                              {p.commissionPct
                                ? formatPercentage(p.commissionPct)
                                : p.commissionFixed
                                ? formatCurrencyUSD(p.commissionFixed)
                                : "-"}
                            </span>
                            <IconInfoCircle className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{p.commissionRuleName}</p>
                          <span>Prioridad: {p.priority}</span>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    {!isSellerView && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="p-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProductDialog({ open: true, product: p });
                            }}
                          >
                            <IconEdit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="p-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVariantProduct(p);
                              setOpenVariants(true);
                            }}
                          >
                            <IconVersions className="h-4 w-4" />
                          </Button>
                          {/* <Button
                            size="sm"
                            variant="destructive"
                            className="p-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDeleteDialog(p);
                            }}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button> */}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col items-center justify-between gap-3 py-3 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            Mostrando {rangeStart}-{rangeEnd} de {totalCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Anterior
            </Button>
            <div className="text-sm">
              {page} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* 🔹 Resto de los diálogos SIN CAMBIOS */}
      {!isSellerView && (
        <>
          <DialogProduct
            open={productDialog.open}
            onClose={() => setProductDialog({ open: false, product: null })}
            product={productDialog.product}
            onSave={handleRefresh}
          />
          <DialogVariants
            open={openVariants}
            onClose={() => {
              setOpenVariants(false);
              setSelectedVariantProduct(null);
            }}
            productId={selectedVariantProduct?.id}
            onSave={handleRefresh}
          />

          <AlertDialog
            open={deleteDialog.open}
            onOpenChange={(open) => setDeleteDialog({ open, product: null })}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Eliminar {deleteDialog.product?.name}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDelete}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {selectedProduct && (
        <ProductDetailDialog
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
          fxRate={fxRate}
          paymentMethods={paymentMethods}
          paymentInstallments={paymentInstallments}
        />
      )}
    </TooltipProvider>
  );
};

export default ProductsTable;
