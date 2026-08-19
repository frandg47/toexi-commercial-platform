import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import DialogAddCustomer from "./DialogAddCustomer";
import { formatPersonName } from "@/utils/formatName";
import { Checkbox } from "@/components/ui/checkbox";
import {
  IconChevronRight,
  IconChevronLeft,
  IconTrash,
  IconUserPlus,
  IconArrowsExchange,
  IconScan,
} from "@tabler/icons-react";

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(n || 0);

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n || 0);

const SERIAL_AVAILABLE_STATUS = "available";

const normalizeIdentifier = (str) =>
  (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isSerialTrackedVariant = (variant) =>
  variant?.products?.inventory_tracking_mode === "serial" ||
  variant?.inventory_tracking_mode === "serial";

const getVariantQuantity = (variant) =>
  isSerialTrackedVariant(variant)
    ? variant?.inventory_unit_ids?.length ?? 0
    : Number(variant?.quantity || 0);

export default function SheetCanje({ open, onOpenChange, userId }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Exchange rates
  const [exchangeRate, setExchangeRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);

  // Lookups
  const [customers, setCustomers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);

  // Step 1: Customer / Seller / Channel
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchSeller, setSearchSeller] = useState("");
  const [focusCustomer, setFocusCustomer] = useState(false);
  const [focusSeller, setFocusSeller] = useState(false);
  const [dialogCustomerOpen, setDialogCustomerOpen] = useState(false);

  // Step 2: Received product
  const [searchReceivedVariant, setSearchReceivedVariant] = useState("");
  const [focusReceivedVariant, setFocusReceivedVariant] = useState(false);
  const [selectedReceivedVariant, setSelectedReceivedVariant] = useState(null);
  const [receivedCurrency, setReceivedCurrency] = useState("ARS");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [manualFxRate, setManualFxRate] = useState("");
  const [rateMode, setRateMode] = useState("system");
  const [receivedImei, setReceivedImei] = useState("");

  // Step 3: Products to buy
  const [searchProduct, setSearchProduct] = useState("");
  const [focusProduct, setFocusProduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchVariant, setSearchVariant] = useState("");
  const [focusVariant, setFocusVariant] = useState(false);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState("");

  // Load data on open (sellers, channels, rates — NOT customers)
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedCustomer(null);
    setSelectedSeller(null);
    setSelectedChannel("");
    setSearchCustomer("");
    setSearchSeller("");
    setSelectedReceivedVariant(null);
    setReceivedCurrency("ARS");
    setReceivedAmount("");
    setManualFxRate("");
    setRateMode("system");
    setReceivedImei("");
    setCart([]);
    setNotes("");

    const load = async () => {
      const [sellerRes, chRes, fxRes] = await Promise.all([
        supabase.from("users").select("*").in("role", ["seller", "superadmin"]).eq("is_active", true).order("name"),
        supabase.from("sales_channels").select("*").order("name"),
        supabase.from("fx_rates").select("source, rate").eq("is_active", true).in("source", ["blue", "USDT"]),
      ]);
      setSellers(sellerRes.data || []);
      setSalesChannels(chRes.data || []);
      const rates = fxRes.data || [];
      const blue = rates.find((r) => r.source?.toLowerCase() === "blue");
      const usdt = rates.find((r) => r.source?.toUpperCase() === "USDT");
      setExchangeRate(blue?.rate ? Number(blue.rate) : null);
      setUsdtRate(usdt?.rate ? Number(usdt.rate) : null);
      const local = (chRes.data || []).find((c) => c.name?.toLowerCase() === "local");
      if (local) setSelectedChannel(String(local.id));
    };
    load();
  }, [open]);

  // Dynamic customer search (like SheetNewSale)
  useEffect(() => {
    if (!focusCustomer) return;
    const q = searchCustomer.trim();
    const fetchCustomers = async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, last_name, dni, phone, email, notes")
        .or(
          `name.ilike.%${q}%,last_name.ilike.%${q}%,dni.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
        )
        .limit(20);
      setCustomers(data || []);
    };
    fetchCustomers();
  }, [focusCustomer, searchCustomer]);

  // Fetch products for step 3 (dynamic search on focus, like SheetNewSale)
  useEffect(() => {
    if (step !== 3 || !open || !focusProduct) return;
    const q = searchProduct.trim();
    const fetchProducts = async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, active, inventory_tracking_mode, product_variants(stock)")
        .eq("active", true)
        .ilike("name", `%${q}%`)
        .limit(30);

      const normalized = (data || []).map((product) => {
        const stockTotal = (product.product_variants || []).reduce(
          (sum, v) => sum + Number(v.stock || 0), 0
        );
        return {
          id: product.id,
          name: product.name,
          inventory_tracking_mode: product.inventory_tracking_mode || "quantity",
          stock: stockTotal,
        };
      });
      setProducts(normalized);
    };
    fetchProducts();
  }, [step, open, focusProduct, searchProduct]);

  // Search received variants (step 2)
  useEffect(() => {
    if (!searchReceivedVariant || searchReceivedVariant.length < 2) {
      setVariants([]);
      return;
    }
    const timer = setTimeout(async () => {
      const q = searchReceivedVariant;

      // Query 1: Find products matching the search term
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id")
        .ilike("name", `%${q}%`)
        .eq("active", true)
        .limit(20);

      const productIds = (matchingProducts || []).map((p) => p.id);

      // Query 2a: Variants from matching products
      // Query 2b: Variants matching by variant_name directly
      const [byProduct, byVariantName] = await Promise.all([
        productIds.length > 0
          ? supabase
              .from("product_variants")
              .select("id, variant_name, color, storage, ram, usd_price, cost_price_usd, stock, active, product_id, products!product_variants_product_id_fkey(name, inventory_tracking_mode)")
              .in("product_id", productIds)
              .eq("active", true)
              .limit(40)
          : { data: [] },
        supabase
          .from("product_variants")
          .select("id, variant_name, color, storage, ram, usd_price, cost_price_usd, stock, active, product_id, products!product_variants_product_id_fkey(name, inventory_tracking_mode)")
          .ilike("variant_name", `%${q}%`)
          .eq("active", true)
          .limit(40),
      ]);

      // Merge and deduplicate
      const seen = new Set();
      const merged = [];
      for (const v of [...(byProduct.data || []), ...(byVariantName.data || [])]) {
        if (!seen.has(v.id)) {
          seen.add(v.id);
          merged.push(v);
        }
      }

      setVariants(merged.slice(0, 40));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchReceivedVariant]);

  // Search variants for step 3 (like SheetNewSale variant search)
  const [buyVariants, setBuyVariants] = useState([]);
  useEffect(() => {
    if (step !== 3 || !selectedProduct) {
      setBuyVariants([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("product_variants")
        .select("id, variant_name, color, storage, ram, usd_price, wholesale_price, stock, active, product_id, products(name, inventory_tracking_mode)")
        .eq("active", true)
        .eq("product_id", selectedProduct.id)
        .gt("stock", 0)
        .ilike("variant_name", `%${searchVariant}%`)
        .limit(40);
      setBuyVariants(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchVariant, selectedProduct, step, focusVariant]);

  // Effective FX rate
  const effectiveRate = useMemo(() => {
    if (rateMode === "manual" && manualFxRate) return Number(manualFxRate);
    if (receivedCurrency === "ARS") return exchangeRate;
    if (receivedCurrency === "USDT") return usdtRate;
    return exchangeRate;
  }, [rateMode, manualFxRate, receivedCurrency, exchangeRate, usdtRate]);

  // Received value in USD
  const receivedUsd = useMemo(() => {
    const amt = Number(receivedAmount) || 0;
    if (receivedCurrency === "USD" || receivedCurrency === "USDT") return amt;
    if (effectiveRate > 0) return amt / effectiveRate;
    return 0;
  }, [receivedAmount, receivedCurrency, effectiveRate]);

  // Received value in ARS
  const receivedArs = useMemo(() => {
    const amt = Number(receivedAmount) || 0;
    if (receivedCurrency === "ARS") return amt;
    if (receivedCurrency === "USD" && exchangeRate) return amt * exchangeRate;
    if (receivedCurrency === "USDT" && usdtRate) return amt * usdtRate;
    return amt;
  }, [receivedAmount, receivedCurrency, exchangeRate, usdtRate]);

  // Cart totals
  const cartTotalUsd = useMemo(() => {
    return cart
      .filter((item) => !item.isFree)
      .reduce((sum, item) => sum + (item.usd_price * getVariantQuantity(item)), 0);
  }, [cart]);

  const cartTotalArs = useMemo(() => {
    return cartTotalUsd * (exchangeRate || 0);
  }, [cartTotalUsd, exchangeRate]);

  // Difference (positive = customer owes, negative = store owes customer, 0 = exact)
  const difference = useMemo(() => {
    return cartTotalArs - receivedArs;
  }, [cartTotalArs, receivedArs]);

  // Helpers
  const addToCart = (variant) => {
    const existing = cart.find((c) => c.id === variant.id);
    if (existing) {
      if (isSerialTrackedVariant(variant)) return;
      setCart(cart.map((c) =>
        c.id === variant.id ? { ...c, quantity: c.quantity + 1 } : c
      ));
    } else {
      setCart([...cart, {
        ...variant,
        quantity: isSerialTrackedVariant(variant) ? 0 : 1,
        imeis: [],
        inventory_unit_ids: [],
        serialSearch: "",
        isFree: false,
      }]);
    }
    setSearchVariant("");
    setBuyVariants([]);
    setSelectedProduct(null);
    setSearchProduct("");
  };

  const removeFromCart = (variantId) => {
    setCart(cart.filter((c) => c.id !== variantId));
  };

  const updateCartQuantity = (variantId, qty) => {
    if (qty <= 0) return removeFromCart(variantId);
    setCart(cart.map((c) =>
      c.id === variantId ? { ...c, quantity: qty } : c
    ));
  };

  const handleToggleFree = (variantId) => {
    setCart((prev) =>
      prev.map((v) =>
        v.id === variantId ? { ...v, isFree: !v.isFree } : v
      )
    );
  };

  const handleSerialSearchChange = (variantId, value) => {
    setCart((prev) =>
      prev.map((v) =>
        v.id === variantId ? { ...v, serialSearch: value } : v
      )
    );
  };

  const handleSerialUnitSubmit = async (variantId) => {
    const variant = cart.find((item) => item.id === variantId);
    if (!variant || !isSerialTrackedVariant(variant)) return;

    const serialSearch = variant.serialSearch?.trim();
    if (!serialSearch) return;

    const normalizedIdentifier = normalizeIdentifier(serialSearch);
    if (!normalizedIdentifier) return;

    const duplicateInCart = cart.some((item) =>
      (item.imeis || []).some(
        (identifier) => normalizeIdentifier(identifier) === normalizedIdentifier
      )
    );

    if (duplicateInCart) {
      toast.error("Esa unidad ya fue agregada al carrito");
      return;
    }

    const { data, error } = await supabase
      .from("inventory_units")
      .select("id, variant_id, identifier_value, status")
      .eq("variant_id", variantId)
      .eq("identifier_normalized", normalizedIdentifier)
      .eq("status", SERIAL_AVAILABLE_STATUS)
      .limit(1);

    if (error) {
      console.error("Error buscando unidad serializada:", error);
      toast.error("No se pudo validar la unidad en inventario");
      return;
    }

    const inventoryUnit = data?.[0];
    if (!inventoryUnit) {
      toast.error("No se encontró una unidad disponible con ese IMEI/SN");
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.id === variantId
          ? {
              ...item,
              inventory_unit_ids: [...(item.inventory_unit_ids || []), inventoryUnit.id],
              imeis: [...(item.imeis || []), inventoryUnit.identifier_value],
              serialSearch: "",
            }
          : item
      )
    );

    toast.success("Unidad agregada desde inventario");
  };

  const removeSerialUnit = (variantId, unitIndex) => {
    setCart((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? {
              ...v,
              inventory_unit_ids: (v.inventory_unit_ids || []).filter((_, index) => index !== unitIndex),
              imeis: (v.imeis || []).filter((_, index) => index !== unitIndex),
            }
          : v
      )
    );
  };

  // Submit
  const handleSubmit = async () => {
    if (!selectedCustomer) return toast.error("Seleccioná un cliente");
    if (!selectedReceivedVariant) return toast.error("Seleccioná el producto recibido");
    if (!receivedAmount || Number(receivedAmount) <= 0) return toast.error("Ingresá el monto cotizado");
    if (cart.length === 0) return toast.error("Agregá al menos un producto a comprar");

    const isSerial = selectedReceivedVariant.products?.inventory_tracking_mode === "serial";
    if (isSerial && (!receivedImei || !receivedImei.trim())) {
      return toast.error("El producto recibido es serializado, ingresá el IMEI/SN");
    }

    const missingSerial = cart.find(
      (v) => isSerialTrackedVariant(v) && getVariantQuantity(v) === 0
    );
    if (missingSerial) {
      return toast.error(
        `Debes agregar unidades serializadas para ${missingSerial.products?.name || missingSerial.variant_name}`
      );
    }

    setLoading(true);
    try {
      const items = cart.map((v) => ({
        variant_id: v.id,
        quantity: getVariantQuantity(v),
        usd_price: v.usd_price,
        is_gift: v.isFree || false,
        imeis: v.imeis || [],
        inventory_unit_ids: v.inventory_unit_ids || [],
      }));

      const { data, error } = await supabase.rpc("create_canje_sale", {
        p_customer_id: selectedCustomer.id,
        p_seller_id: selectedSeller?.id_auth || userId,
        p_sales_channel_id: selectedChannel ? Number(selectedChannel) : null,
        p_received_variant_id: selectedReceivedVariant.id,
         p_received_amount_ars: receivedArs,
        p_received_currency: receivedCurrency,
        p_fx_rate_used: effectiveRate || 0,
        p_imei: receivedImei || null,
        p_items: items,
        p_notes: notes || null,
      });

      if (error) throw error;

      toast.success("Canje registrado", {
        description: `Venta #${data?.sale_id || ""} creada como pendiente`,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error("Error al registrar canje", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>Plan Canje</SheetTitle>
              <SheetDescription>
                {step === 1 && "Completá los datos para el canje."}
                {step === 2 && "Producto recibido en canje."}
                {step === 3 && "Productos a comprar."}
              </SheetDescription>
            </div>
            <IconArrowsExchange className="absolute right-12 top-6 h-6 w-6 text-primary" />
          </div>

          {/* Wizard header */}
          <div className="flex items-center justify-center mt-3 border-b pb-2">
            <div className="flex items-center gap-2 text-sm">
              <span className={step >= 1 ? "font-semibold text-primary" : ""}>
                1. Cliente
              </span>
              <IconChevronRight className="h-4 w-4" />
              <span className={step >= 2 ? "font-semibold text-primary" : ""}>
                2. Canje
              </span>
              <IconChevronRight className="h-4 w-4" />
              <span className={step >= 3 ? "font-semibold text-primary" : ""}>
                3. Compra
              </span>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 sm:px-4">
          {/* ========== PASO 1: CLIENTE ========== */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">Seleccionar cliente</h3>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Buscar cliente..."
                    value={
                      selectedCustomer
                        ? formatPersonName(selectedCustomer.name, selectedCustomer.last_name)
                        : searchCustomer
                    }
                    onFocus={() => setFocusCustomer(true)}
                    onBlur={() => setTimeout(() => setFocusCustomer(false), 160)}
                    onChange={(e) => {
                      setSelectedCustomer(null);
                      setSearchCustomer(e.target.value);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDialogCustomerOpen(true)}
                    title="Nuevo cliente"
                  >
                    <IconUserPlus className="h-5 w-5" />
                  </Button>
                </div>
                {focusCustomer && (
                  <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                    <ScrollArea className="max-h-[250px] overflow-y-auto">
                      {customers.length > 0 ? (
                        customers.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setFocusCustomer(false);
                              setSearchCustomer("");
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                          >
                            <div className="font-medium">
                              {formatPersonName(c.name, c.last_name)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              DNI: {c.dni || "N/D"} • Contacto: {c.phone || c.email || "Sin contacto"}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Sin coincidencias
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="mb-3 font-medium">Asignar vendedor (opcional)</h3>
                <div className="relative">
                  <Input
                    placeholder="Buscar vendedor..."
                    value={
                      selectedSeller
                        ? `${selectedSeller.name ?? ""} ${selectedSeller.last_name ?? ""}`.trim()
                        : searchSeller
                    }
                    onChange={(e) => {
                      setSelectedSeller(null);
                      setSearchSeller(e.target.value);
                    }}
                    onFocus={() => setFocusSeller(true)}
                    onBlur={() => setTimeout(() => setFocusSeller(false), 150)}
                  />
                  {focusSeller && (
                    <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                      <ScrollArea className="max-h-[240px] overflow-y-auto">
                        {sellers.length > 0 ? (
                          sellers.map((s) => (
                            <button
                              type="button"
                              key={s.id_auth}
                              onClick={() => {
                                setSelectedSeller(s);
                                setFocusSeller(false);
                                setSearchSeller("");
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-muted"
                            >
                              <div className="font-medium">
                                {[s.name, s.last_name].filter(Boolean).join(" ") || "Sin nombre"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.phone || s.email || "Sin contacto"}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Sin coincidencias
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="mb-3 font-medium">Canal de venta</h3>
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar canal de venta" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {salesChannels.map((ch) => (
                      <SelectItem key={ch.id} value={String(ch.id)}>
                        {ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button disabled={!selectedCustomer} onClick={() => setStep(2)}>
                  Siguiente
                  <IconChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ========== PASO 2: PRODUCTO RECIBIDO ========== */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Producto recibido</h3>

              <div className="relative">
                <Input
                  placeholder="Buscar variante (nombre, color, storage)..."
                  value={selectedReceivedVariant ? `${selectedReceivedVariant.products?.name || ""} - ${selectedReceivedVariant.variant_name || ""}` : searchReceivedVariant}
                  onFocus={() => setFocusReceivedVariant(true)}
                  onBlur={() => setTimeout(() => setFocusReceivedVariant(false), 200)}
                  onChange={(e) => {
                    setSelectedReceivedVariant(null);
                    setSearchReceivedVariant(e.target.value);
                  }}
                />
                {focusReceivedVariant && !selectedReceivedVariant && (
                  <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                    <ScrollArea className="max-h-[250px] overflow-y-auto">
                      {variants.length > 0 ? (
                        variants.map((v) => (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => {
                              setSelectedReceivedVariant(v);
                              setFocusReceivedVariant(false);
                              setSearchReceivedVariant("");
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                          >
                            <div className="font-medium">{v.products?.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {v.variant_name} | Stock: {v.stock}{v.color ? ` | Color: ${v.color}` : ""} | Costo: {formatUSD(v.cost_price_usd)}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Sin coincidencias
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>

              {selectedReceivedVariant && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="font-medium text-sm">{selectedReceivedVariant.products?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedReceivedVariant.variant_name} | Stock actual: {selectedReceivedVariant.stock}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <h3 className="font-medium">Moneda</h3>
                  <Select value={receivedCurrency} onValueChange={setReceivedCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="ARS">ARS</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium">Monto cotizado</h3>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                  />
                </div>
              </div>

              {receivedCurrency === "ARS" && (
                <div className="space-y-2">
                  <h3 className="font-medium">Cotización</h3>
                  <div className="flex gap-2">
                    <Select value={rateMode} onValueChange={setRateMode}>
                      <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[9999]">
                        <SelectItem value="system">Sistema</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                    {rateMode === "manual" && (
                      <Input
                        type="number"
                        placeholder="Cotización"
                        value={manualFxRate}
                        onChange={(e) => setManualFxRate(e.target.value)}
                      />
                    )}
                    {rateMode === "system" && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        {effectiveRate ? `$ ${Number(effectiveRate).toLocaleString("es-AR")}` : "Sin cotización"}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor en USD:</span>
                  <span className="font-medium">{formatUSD(receivedUsd)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor en ARS:</span>
                  <span className="font-medium">{formatARS(receivedArs)}</span>
                </div>
              </div>

              {selectedReceivedVariant?.products?.inventory_tracking_mode === "serial" && (
                <div className="space-y-2">
                  <h3 className="font-medium">IMEI / Código único</h3>
                  <Input
                    placeholder="Ingresar IMEI o SN"
                    value={receivedImei}
                    onChange={(e) => setReceivedImei(e.target.value)}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <IconChevronLeft className="h-4 w-4" />
                  Volver
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedReceivedVariant) return toast.error("Seleccioná el producto recibido");
                    if (!receivedAmount || Number(receivedAmount) <= 0) return toast.error("Ingresá el monto cotizado");
                    if (selectedReceivedVariant?.products?.inventory_tracking_mode === "serial" && (!receivedImei || !receivedImei.trim())) {
                      return toast.error("El producto es serializado, ingresá el IMEI/SN");
                    }
                    setStep(3);
                  }}
                >
                  Siguiente
                  <IconChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ========== PASO 3: PRODUCTOS A COMPRAR ========== */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Búsqueda de producto */}
              <div className="relative">
                <Input
                  placeholder="Buscar producto..."
                  value={selectedProduct ? selectedProduct.name : searchProduct}
                  onFocus={() => setFocusProduct(true)}
                  onBlur={() => setTimeout(() => setFocusProduct(false), 160)}
                  onChange={(e) => { setSelectedProduct(null); setSearchProduct(e.target.value); }}
                />
                {focusProduct && !selectedProduct && (
                  <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                    <ScrollArea className="max-h-[250px] overflow-y-auto">
                      {products.length > 0 ? (
                        products.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => {
                              if (Number(p.stock || 0) <= 0) {
                                toast.warning("Producto sin stock");
                                return;
                              }
                              setSelectedProduct(p);
                              setFocusProduct(false);
                              setSearchProduct("");
                              setBuyVariants([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                          >
                            {p.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              Stock: {Number(p.stock || 0)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Sin coincidencias
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>

              {/* Búsqueda de variante */}
              {selectedProduct && (
                <div className="relative">
                  <Input
                    placeholder="Buscar variante..."
                    value={searchVariant}
                    onFocus={() => setFocusVariant(true)}
                    onBlur={() => setTimeout(() => setFocusVariant(false), 160)}
                    onChange={(e) => setSearchVariant(e.target.value)}
                  />
                  {focusVariant && buyVariants.length > 0 && (
                    <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                      <ScrollArea className="max-h-[250px] overflow-y-auto">
                        {buyVariants.map((v) => (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => addToCart(v)}
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                          >
                            <div className="flex justify-between">
                              <span className="font-medium">{v.variant_name}</span>
                              <span className="text-muted-foreground">{formatUSD(v.usd_price)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {v.color} | Stock: {v.stock}
                            </div>
                          </button>
                        ))}
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}

              {/* Carrito */}
              {cart.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <h4 className="text-sm font-semibold">Carrito de canje ({cart.length})</h4>

                  {cart.map((item) => {
                    const isSerial = isSerialTrackedVariant(item);
                    const quantity = getVariantQuantity(item);
                    return (
                      <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.products?.name || item.variant_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.variant_name} | {formatUSD(item.usd_price)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                              <Checkbox
                                checked={item.isFree}
                                onCheckedChange={() => handleToggleFree(item.id)}
                              />
                              <span className={item.isFree ? "text-green-600 font-medium" : "text-muted-foreground"}>
                                Regalo
                              </span>
                            </label>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Unidades / cantidad */}
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Cantidad ({quantity})
                          </label>
                          <div className="space-y-2 mt-1">
                            {isSerial ? (
                              <>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Escanear o escribir IMEI/SN"
                                    value={item.serialSearch || ""}
                                    onChange={(e) =>
                                      handleSerialSearchChange(item.id, e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSerialUnitSubmit(item.id);
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleSerialUnitSubmit(item.id)}
                                  >
                                    Agregar
                                  </Button>
                                </div>
                                {(item.imeis || []).length > 0 ? (
                                  (item.imeis || []).map((imei, idx) => (
                                    <div key={`${item.id}-${imei}-${idx}`} className="flex gap-2 items-center">
                                      <Input value={imei} readOnly />
                                      <Button
                                        variant="destructive"
                                        size="icon"
                                        onClick={() => removeSerialUnit(item.id, idx)}
                                      >
                                        <IconTrash className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Agrega unidades existentes del inventario para esta variante.
                                  </p>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateCartQuantity(item.id, Math.max(item.quantity - 1, 1))}
                                >
                                  <IconChevronLeft className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                >
                                  <IconChevronRight className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Subtotal */}
                        <div className="flex justify-between pt-2 border-t text-xs text-muted-foreground">
                          <span>Subtotal ({quantity}u)</span>
                          {item.isFree ? (
                            <div className="text-sm font-semibold text-green-600">
                              SIN COSTO
                            </div>
                          ) : (
                            <span className="font-medium text-foreground">
                              {formatARS(item.usd_price * quantity * (exchangeRate || 0))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Resumen + Notas + Botones al final */}
              {cart.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Crédito canje:</span>
                      <span className="font-medium text-green-600">{formatARS(receivedArs)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total compra:</span>
                      <span className="font-medium">{formatARS(cartTotalArs)}</span>
                    </div>
                    {difference === 0 ? (
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="font-medium">Canje</span>
                        <span className="font-bold text-green-600">Exacto</span>
                      </div>
                    ) : difference > 0 ? (
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="font-medium">A cobrar:</span>
                        <span className="font-bold text-foreground">{formatARS(difference)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="font-medium text-green-600">A favor del cliente:</span>
                        <span className="font-bold text-green-600">{formatARS(Math.abs(difference))}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-medium">Notas (opcional)</h3>
                    <Textarea
                      placeholder="Notas sobre el canje..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <IconChevronLeft className="h-4 w-4" />
                      Volver
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                      {loading ? "Registrando..." : "Registrar canje"}
                      <IconChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter />
      </SheetContent>

      <DialogAddCustomer
        open={dialogCustomerOpen}
        onOpenChange={setDialogCustomerOpen}
        onCustomerCreated={(c) => {
          setSelectedCustomer(c);
          setDialogCustomerOpen(false);
        }}
      />
    </Sheet>
  );
}
