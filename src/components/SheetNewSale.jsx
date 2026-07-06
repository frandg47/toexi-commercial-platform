import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import DialogSaleInvoice from "./DialogSaleInvoice";
import DialogAddCustomer from "./DialogAddCustomer";
import { formatPersonName } from "@/utils/formatName";
import {
  IconX,
  IconCash,
  IconCreditCard,
  IconBuildingBank,
  IconReceipt2,
  IconChevronRight,
  IconChevronLeft,
  IconTrash,
  IconCirclePlus,
  IconUserPlus,
  IconScan,
} from "@tabler/icons-react";
// import { useNavigate } from "react-router-dom";
// import { useSaleStore } from "../store/useSaleStore";

export default function SheetNewSale({ open, onOpenChange, lead }) {
  const ARS_TOLERANCE = 10;
  const SERIAL_AVAILABLE_STATUS = "available";
  // --- Wizard ---
  const [step, setStep] = useState(1);

  // --- Loading flags ---
  const [loading, setLoading] = useState(false);

  // --- Exchange rate ---
  const [exchangeRate, setExchangeRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);

  // --- Lookups ---
  const [customers, setCustomers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);

  // --- Search fields / focus controllers ---
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchSeller, setSearchSeller] = useState("");
  const [searchProduct, setSearchProduct] = useState("");
  const [searchVariant, setSearchVariant] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [focusCustomer, setFocusCustomer] = useState(false);
  const [focusSeller, setFocusSeller] = useState(false);
  const [focusProduct, setFocusProduct] = useState(false);
  const [focusVariant, setFocusVariant] = useState(false);
  const barcodeInputRef = useRef(null);

  // --- Selected entities / cart ---
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState([]); // each: {...variant, quantity}

  // --- Notes ---
  const [form, setForm] = useState({ notes: "" });

  // --- Discount ---
  const [discount, setDiscount] = useState({
    type: "none", // none | percent | fixed
    value: 0
  });

  // --- Surcharge ---
  const [surcharge, setSurcharge] = useState({
    type: "none", // none | percent | fixed
    value: 0
  });


  // --- Payments (mixto) ---
  const [payments, setPayments] = useState([
    { method: "", amount: "", reference: "", installments: "", account_id: "" },
  ]);

  // --- Invoice dialog ---
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // --- Add Customer dialog ---
  const [dialogCustomerOpen, setDialogCustomerOpen] = useState(false);

  // Métodos de pago desde la BD
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentInstallments, setPaymentInstallments] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // Canales de venta
  const [salesChannels, setSalesChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState("");

  // Tipo de precio: "normal" o "mayorista"
  const [priceType, setPriceType] = useState("normal");


  // const navigate = useNavigate();
  // const setCustomer = useSaleStore((s) => s.setCustomer);
  // const setItems = useSaleStore((s) => s.setItems);
  // const setFxRate = useSaleStore((s) => s.setFxRate);
  // const setNotes = useSaleStore((s) => s.setNotes);

  // ========== HELPERS ==========


  const getPriceUSD = (variant) => {
    if (priceType === "mayorista" && variant.wholesale_price) {
      return variant.wholesale_price;
    }
    return variant.usd_price;
  };

  const formatARS = (n) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(n || 0);

  const normalizeIdentifier = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const isSerialTrackedVariant = (variant) =>
    variant?.products?.inventory_tracking_mode === "serial" ||
    variant?.inventory_tracking_mode === "serial";

  const getVariantQuantity = (variant) =>
    isSerialTrackedVariant(variant)
      ? variant?.inventory_unit_ids?.length ?? 0
      : Number(variant?.quantity || 0);

const buildSelectedVariant = (variant) => ({
    ...variant,
    quantity: isSerialTrackedVariant(variant) ? 0 : 1,
    imeis: [],
    inventory_unit_ids: [],
    serialSearch: "",
    isFree: false,
  });

  const formatUSD = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n || 0);




// Total base en ARS (sin recargos)
  const baseTotal = useMemo(() => {
    if (!exchangeRate) return 0;
    return selectedVariants.reduce(
      (acc, v) => acc + (v.isFree ? 0 : getPriceUSD(v) * getVariantQuantity(v) * exchangeRate),
      0
    );


  }, [selectedVariants, exchangeRate, priceType]);

  const discountAmount = useMemo(() => {
    if (discount.type === "percent") {
      return baseTotal * (discount.value / 100);
    }
    if (discount.type === "fixed") {
      return discount.value;
    }
    return 0;
  }, [discount, baseTotal]);

  const surchargeAmount = useMemo(() => {
    if (surcharge.type === "percent") {
      return baseTotal * (surcharge.value / 100);
    }
    if (surcharge.type === "fixed") {
      return surcharge.value;
    }
    return 0;
  }, [surcharge, baseTotal]);

  const getPaymentDisplayCurrency = (methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return "USDT";
    if (upper === "USD") return "USD";
    return "ARS";
  };

  const isUSDMethod = (methodName) =>
    ["USD", "USDT"].includes(methodName?.toUpperCase());

  const getPaymentFxRate = (methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return usdtRate;
    if (upper === "USD") return exchangeRate;
    return 1;
  };
  // pagos sin interés (efectivo/transfer/macro)
  const paidNoInterest = useMemo(() => {
    return payments
      .filter((p) => {
        const info = paymentInstallments.find(
          (i) =>
            i.payment_method_id === Number(p.payment_method_id) &&
            i.installments === Number(p.installments)
        );
        const multiplier = info?.multiplier || p.multiplier || 1;
        return Number(multiplier) === 1;
      })
      .reduce((acc, p) => {
        const amount = Number(p.amount || 0);
        if (isUSDMethod(p.method_name)) {
          const rate = getPaymentFxRate(p.method_name);
          if (rate) {
            return acc + amount * rate;
          }
        }
        return acc + amount;
      }, 0);
  }, [payments, paymentInstallments, exchangeRate, usdtRate]);

  const totalAfterAdjustments = useMemo(() => {
    return Math.max(baseTotal - discountAmount + surchargeAmount, 0);
  }, [baseTotal, discountAmount, surchargeAmount]);

  // buscar método con interés (si existe)
  const interestMethod = useMemo(() => {
    return payments.find((p) => {
      const info = paymentInstallments.find(
        (i) =>
          i.payment_method_id === Number(p.payment_method_id) &&
          i.installments === Number(p.installments)
      );
      const multiplier = info?.multiplier || p.multiplier || 1;
      return Number(multiplier) > 1;
    });
  }, [payments, paymentInstallments]);

  // multiplicador de interés
  const multiplier = interestMethod
    ? paymentInstallments.find(
      (i) =>
        i.payment_method_id === Number(interestMethod.payment_method_id) &&
        i.installments === Number(interestMethod.installments)
    )?.multiplier || 1
    : 1;


  // saldo después de pagos sin interés
  const saldo = useMemo(() => {
    return Math.max(totalAfterAdjustments - paidNoInterest, 0);
  }, [totalAfterAdjustments, paidNoInterest]);

  // total final con recargo
  const totalWithSurcharge = useMemo(() => {
    if (!interestMethod) return totalAfterAdjustments;

    const interestPart = saldo * (multiplier - 1);
    return totalAfterAdjustments + interestPart;
  }, [totalAfterAdjustments, saldo, multiplier, interestMethod]);

  const depositData = useMemo(() => {
    if (!lead?.deposit_paid) {
      return { amount: 0, currency: "ARS", amountARS: 0 };
    }

    const amount = Number(lead.deposit_amount || 0);
    const currency = lead.deposit_currency || "ARS";
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const amountARS =
      currency === "USD" && exchangeRate
        ? safeAmount * exchangeRate
        : safeAmount;

    return { amount: safeAmount, currency, amountARS };
  }, [lead, exchangeRate]);

  const totalDue = useMemo(() => {
    return Math.max(totalWithSurcharge - depositData.amountARS, 0);
  }, [totalWithSurcharge, depositData.amountARS]);

  const totalUsdDue = useMemo(() => {
    if (!exchangeRate) return 0;
    return totalDue / exchangeRate;
  }, [totalDue, exchangeRate]);

  const hasMissingAccount = useMemo(
    () =>
      payments.some(
        (p) => p.payment_method_id && (!p.account_id || p.account_id === "")
      ),
    [payments]
  );

  const getAccountsForPayment = (payment) => {
    if (!payment?.method_name) return accounts;
    const currency = getPaymentDisplayCurrency(payment.method_name);
    return accounts.filter((acc) => acc.currency === currency);
  };

  // cuánto lleva pagado el cliente (en ARS, convertiendo USD si aplica)
  const paidARS = useMemo(() => {
    return payments.reduce((acc, p) => {
      const amount = Number(p.amount || 0);
      if (isUSDMethod(p.method_name)) {
        const rate = getPaymentFxRate(p.method_name);
        if (rate) {
          return acc + (amount * rate);
        }
      }
      return acc + amount;
    }, 0);
  }, [payments, exchangeRate, usdtRate]);

  // saldo restante
  const remaining = useMemo(() => {
    return Math.max(totalDue - paidARS, 0);
  }, [totalDue, paidARS]);

// Total USD original (excluye gratuitos)
  const subtotalUSD = useMemo(() => {
    return selectedVariants.reduce(
      (acc, v) => acc + (v.isFree ? 0 : getPriceUSD(v) * getVariantQuantity(v)),
      0
    );
  }, [selectedVariants, priceType]);


  const subtotalWithSurcharge = useMemo(() => {
    return totalWithSurcharge + discountAmount - surchargeAmount;
  }, [totalWithSurcharge, discountAmount, surchargeAmount]);

  const filteredSellers = useMemo(() => {
    const q = searchSeller.trim().toLowerCase();
    if (!q) return sellers.slice(0, 30);
    return sellers
      .filter((s) =>
        [s.name, s.last_name, s.email, s.phone]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [sellers, searchSeller]);

  const methodIcon = (m) => {
    if (m === "efectivo") return <IconCash className="h-4 w-4" />;
    if (m === "transferencia") return <IconBuildingBank className="h-4 w-4" />;
    if (m === "tarjeta") return <IconCreditCard className="h-4 w-4" />;
    return <IconCreditCard className="h-4 w-4" />;
  };

  // ========== EFFECTS ==========

  // Cotización activa
  useEffect(() => {
    const fetchExchangeRate = async () => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select("source, rate")
        .eq("is_active", true)
        .in("source", ["blue", "USDT"]);

      if (error) console.error("Error obteniendo cotización:", error);
      const rates = data || [];
      const blueRate = rates.find(
        (r) => r.source?.toLowerCase() === "blue"
      );
      const usdt = rates.find(
        (r) => r.source?.toUpperCase() === "USDT"
      );
      setExchangeRate(blueRate?.rate ? Number(blueRate.rate) : null);
      setUsdtRate(usdt?.rate ? Number(usdt.rate) : null);
    };
    fetchExchangeRate();
  }, []);

  // Vendedores disponibles (rol seller)
  useEffect(() => {
    const fetchSellers = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, id_auth, name, last_name, phone, email, role, is_active")
        .in("role", ["seller", "superadmin"])
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) console.error("Error obteniendo vendedores:", error);
      setSellers(data || []);
    };

    fetchSellers();
  }, []);

  // Obtener métodos de pago y cuotas
  useEffect(() => {
    const fetchPayments = async () => {
      const { data: methods } = await supabase
        .from("payment_methods")
        .select("id, name, multiplier")
        .eq("is_active", true);

      const { data: installments } = await supabase
        .from("payment_installments")
        .select("id, payment_method_id, installments, multiplier");

      setPaymentMethods(methods || []);
      setPaymentInstallments(installments || []);
    };

    fetchPayments();
  }, []);

  // Obtener cuentas
  useEffect(() => {
    const fetchAccounts = async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, currency, is_reference_capital")
        .eq("is_reference_capital", false)
        .order("name", { ascending: true });

      if (error) console.error("Error obteniendo cuentas:", error);
      setAccounts(data || []);
    };

    fetchAccounts();
  }, []);

  // Obtener canales de venta
  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from("sales_channels")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) console.error("Error obteniendo canales:", error);
      setSalesChannels(data || []);
      // Seleccionar "Local" por defecto si existe
      if (data?.length > 0) {
        const local = data.find(ch => ch.name === "Local");
        if (local) setSelectedChannel(String(local.id));
      }
    };

    fetchChannels();
  }, []);

  useEffect(() => {
    if (lead?.seller && lead?.seller?.user?.is_active) {
      setSelectedSeller({
        id_auth: lead.seller.id_auth,
        name: lead.seller.user?.name,
        last_name: lead.seller.user?.last_name,
        phone: lead.seller.user?.phone,
        email: lead.seller.user?.email,
        is_active: lead.seller.user?.is_active,
      });
    } else {
      setSelectedSeller(null);
    }
  }, [lead]);

  // Si viene de un lead, auto-completar
  useEffect(() => {
    if (lead) {
      setSelectedCustomer(lead.customers || null);
      // ❌ YA NO cargamos variantes desde lead (están incompletas)
      setStep(1);
    } else {
      setStep(1);
    }
  }, [lead]);



  const resetFormData = () => {
    // Paso del wizard
    setStep(1);

    // Cliente
    setSelectedCustomer(null);
    setSelectedSeller(null);
    setSearchCustomer("");
    setSearchSeller("");
    setFocusCustomer(false);
    setFocusSeller(false);

    // Producto y variantes
    setSelectedProduct(null);
    setSearchProduct("");
    setBarcodeSearch("");
    setBarcodeLoading(false);
    setVariants([]);
    setSelectedVariants([]);

    // Variantes búsqueda
    setSearchVariant("");
    setFocusVariant(false);

    // Notas
    setForm({ notes: "" });

    // Descuento y recargo
    setDiscount({ type: "none", value: 0 });
    setSurcharge({ type: "none", value: 0 });

    // Canal de venta (volver a Local por defecto)
    const local = salesChannels.find(ch => ch.name === "Local");
    if (local) setSelectedChannel(String(local.id));

    // Pagos
    setPayments([
      { method: "", amount: "", reference: "", installments: "", account_id: "" }
    ]);

    // Datos del preview
    setInvoiceData(null);

    // Lead (no tocar)
  };



  // Enriquecer variantes del lead
  useEffect(() => {
    const enrichVariants = async () => {
      if (!lead || !lead.interested_variants) return;
      // console.log("lead", lead);
      const ids = lead.interested_variants.map((v) => v.id).filter(Boolean);
      if (ids.length === 0) return;

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id, variant_name, color, storage, ram, usd_price, wholesale_price, stock, products(name, inventory_tracking_mode)"
        )
        .in("id", ids);

      if (!error && data) {
        setSelectedVariants(data.map((v) => buildSelectedVariant(v)));
      }
    };
    enrichVariants();
  }, [lead]);

  // Buscar clientes
  useEffect(() => {
    if (!focusCustomer || lead) return;
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
  }, [focusCustomer, searchCustomer, lead]);

  // Buscar productos
  useEffect(() => {
    if (!focusProduct) return;
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
          (sum, v) => sum + Number(v.stock || 0),
          0
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
  }, [focusProduct, searchProduct]);

  // Buscar variantes por producto (solo stock)
  useEffect(() => {
    if (!selectedProduct || !focusVariant) return;
    const q = searchVariant.trim();
    const fetchVariants = async () => {
        const { data } = await supabase
          .from("product_variants")
          .select(
            "id, variant_name, color, storage, ram, usd_price, wholesale_price, stock, products(name, inventory_tracking_mode)"
          )
          .eq("product_id", selectedProduct.id)
          .eq("active", true)
          .gt("stock", 0)
          .ilike("variant_name", `%${q}%`)
          .limit(40);
        setVariants(data || []);
      };
    fetchVariants();
  }, [selectedProduct, focusVariant, searchVariant]);

  useEffect(() => {
    if (!open || step !== 2) return;
    const timer = setTimeout(() => barcodeInputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open, step]);

  const getInstallmentsForMethod = (methodId) => {
    if (!methodId) return [];
    return paymentInstallments.filter(
      (inst) => inst.payment_method_id === Number(methodId)
    );
  };

  // ========== CART HANDLERS ==========
  const handleAddVariant = (variant) => {
    setSelectedVariants(prev => {
      const existing = prev.find(v => v.id === variant.id);
      if (existing) {
        if (isSerialTrackedVariant(existing)) {
          toast.info("La variante serializada ya está en el carrito");
          return prev;
        }

        return prev.map((v) =>
          v.id === variant.id
            ? { ...v, quantity: Number(v.quantity || 0) + 1 }
            : v
        );
      }

      return [...prev, buildSelectedVariant(variant)];
    });
  };

  const normalizeBarcode = (value) => value.trim();

  const variantMatchesBarcode = (variant, barcode) => {
    const normalized = barcode.toLowerCase();
    return ["barcode", "bar_code", "sku", "code", "codigo"].some((field) => {
      const value = variant?.[field];
      return value && String(value).trim().toLowerCase() === normalized;
    });
  };

  const handleBarcodeSubmit = async () => {
    const barcode = normalizeBarcode(barcodeSearch);
    if (!barcode || barcodeLoading) return;

    const loadedVariant = variants.find((variant) =>
      variantMatchesBarcode(variant, barcode)
    );

    if (loadedVariant) {
      handleAddVariant(loadedVariant);
      setBarcodeSearch("");
      toast.success("Producto agregado por codigo de barras");
      barcodeInputRef.current?.focus();
      return;
    }

    setBarcodeLoading(true);

    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id, variant_name, color, storage, ram, usd_price, wholesale_price, stock, barcode, products(name, inventory_tracking_mode)"
        )
        .eq("barcode", barcode)
        .eq("active", true)
        .gt("stock", 0)
        .limit(1);

      if (error) throw error;

      const foundVariant = data?.[0];
      if (!foundVariant) {
        toast.error("No se encontro una variante con ese codigo de barras");
        barcodeInputRef.current?.focus();
        return;
      }

      handleAddVariant(foundVariant);
      setBarcodeSearch("");
      toast.success("Producto agregado por codigo de barras");
      barcodeInputRef.current?.focus();
    } catch (error) {
      console.error("Error buscando codigo de barras:", error);
      toast.error("No se pudo buscar el codigo de barras");
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleQuantityChange = (variantId, value) => {
    const nextQuantity = Math.max(Number(value || 0), 1);
    setSelectedVariants((prev) =>
      prev.map((v) =>
        v.id === variantId && !isSerialTrackedVariant(v)
          ? { ...v, quantity: nextQuantity }
          : v
      )
    );
  };

  const handleSerialSearchChange = (variantId, value) => {
    setSelectedVariants((prev) =>
      prev.map((v) =>
        v.id === variantId ? { ...v, serialSearch: value } : v
      )
    );
  };

  const handleSerialUnitSubmit = async (variantId) => {
    const variant = selectedVariants.find((item) => item.id === variantId);
    if (!variant || !isSerialTrackedVariant(variant)) return;

    const serialSearch = variant.serialSearch?.trim();
    if (!serialSearch) return;

    const normalizedIdentifier = normalizeIdentifier(serialSearch);
    if (!normalizedIdentifier) return;

    const duplicateInCart = selectedVariants.some((item) =>
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

    setSelectedVariants((prev) =>
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
    setSelectedVariants((prev) =>
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

  const handleRemoveVariant = (variantId) => {
    setSelectedVariants((prev) =>
      prev.filter((v) => v.id !== variantId && v.variant_id !== variantId)
    );
  };

  const handleToggleFree = (variantId) => {
    setSelectedVariants((prev) =>
      prev.map((v) =>
        v.id === variantId ? { ...v, isFree: !v.isFree } : v
      )
    );
  };




  // ========== PAYMENTS HANDLERS ==========
  const addPaymentRow = () =>
    setPayments((p) => [
      ...p,
      { method: "", amount: "", reference: "", installments: "", account_id: "" },
    ]);
  const removePaymentRow = (idx) =>
    setPayments((p) => p.filter((_, i) => i !== idx));
  const updatePaymentField = (idx, field, value) =>
    setPayments((p) =>
      p.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );

  // ========== SAVE ==========
  const handleSubmit = async () => {
    if (!selectedCustomer) return toast.error("Selecciona un cliente");
    if (!selectedVariants.length) return toast.error("Agrega productos");
    if (!exchangeRate) return toast.error("Error con la cotización");

    const normalized = payments
      .map((p) => ({
        payment_method_id: p.payment_method_id,
        method_name: p.method_name,
        installments: p.installments || null,
        multiplier: p.multiplier || 1,
        amount: Number(p.amount || 0),
        account_id: p.account_id ? Number(p.account_id) : null,
      }))
      .filter((p) => p.payment_method_id && p.amount > 0);

    if (totalDue > 0 && !normalized.length) {
      return toast.error("Agrega al menos un método de pago");
    }

    if (normalized.some((p) => !p.account_id)) {
      return toast.error("Selecciona una cuenta para cada pago");
    }

    const remainingDiff = Math.abs(paidARS - totalDue);
    if (Math.round(remainingDiff) > ARS_TOLERANCE) {
      return toast.error(
        "El total pagado no coincide con el total de la venta"
      );
    }

    const usesUsd = normalized.some((p) => p.method_name?.toUpperCase() === "USD");
    const usesUsdt = normalized.some((p) => p.method_name?.toUpperCase() === "USDT");
    if (usesUsd && !exchangeRate) {
      return toast.error("No hay cotizacion activa para USD");
    }
    if (usesUsdt && !usdtRate) {
      return toast.error("No hay cotizacion activa para USDT");
    }

    const emptySerialVariant = selectedVariants.find(
      (variant) => isSerialTrackedVariant(variant) && getVariantQuantity(variant) === 0
    );
    if (emptySerialVariant) {
      return toast.error(
        `Debes seleccionar al menos una unidad para ${emptySerialVariant.products?.name || "la variante"}`
      );
    }

    const invalidQuantityVariant = selectedVariants.find(
      (variant) => !isSerialTrackedVariant(variant) && getVariantQuantity(variant) <= 0
    );
    if (invalidQuantityVariant) {
      return toast.error("Todas las cantidades deben ser mayores a cero");
    }

    // Chequeo de stock
    const recheckIds = selectedVariants.map((v) => v.id);
    const { data: fresh, error: freshErr } = await supabase
      .from("product_variants")
      .select("id, stock")
      .in("id", recheckIds);

    if (freshErr) return toast.error("Error validando stock");

    const stockMap = Object.fromEntries(fresh.map((f) => [f.id, f.stock]));
    const insufficient = selectedVariants.find(
      (v) => getVariantQuantity(v) > (stockMap[v.id] ?? 0)
    );
    if (insufficient) {
      return toast.error(`Sin stock para ${insufficient.products.name}`);
    }

// ✅ Armamos los datos que irá al modal
    const items = selectedVariants.map((v) => {
      const quantity = getVariantQuantity(v);
      const unitPrice = v.isFree ? 0 : getPriceUSD(v);

      return {
        variant_id: v.id,
        product_name: v.products?.name,
        variant_name: v.variant_name,
        color: v.color,
        storage: v.storage,
        ram: v.ram,
        usd_price: getPriceUSD(v),
        is_free: v.isFree,
        inventory_tracking_mode: v.products?.inventory_tracking_mode || "quantity",

        quantity,
        imeis: v.imeis || [],
        inventory_unit_ids: v.inventory_unit_ids || [],

        subtotal_usd: unitPrice * quantity,
        subtotal_ars: unitPrice * quantity * exchangeRate,
      };
    });


      const sellerData = lead?.seller
      ? lead?.seller?.user?.is_active
        ? {
            id_auth: lead.seller.id_auth,
            name: lead.seller.user?.name,
            last_name: lead.seller.user?.last_name,
            phone: lead.seller.user?.phone,
            email: lead.seller.user?.email,
            is_active: lead.seller.user?.is_active,
          }
        : null
      : selectedSeller;

    if (sellerData && sellerData.is_active === false) {
      return toast.error("No se puede asignar una venta a un vendedor inactivo");
    }


    const salePreview = {
      customer_id: selectedCustomer.id,
      seller_id: sellerData?.id_auth ?? null,
      lead_id: lead?.id ?? null,
      sales_channel_id: selectedChannel ? Number(selectedChannel) : null,
      sales_channel_name: salesChannels.find(ch => String(ch.id) === selectedChannel)?.name,
      total_usd: totalUsdDue,
      total_ars: items.reduce((acc, it) => acc + it.subtotal_ars, 0),
      fx_rate_used: exchangeRate,
      fx_rate_usdt: usdtRate,
      notes: form.notes || null,
      payments: normalized,
      variants: items,
      customer_name: `${selectedCustomer.name} ${selectedCustomer.last_name ?? ""
        }`,
      customer_phone: selectedCustomer.phone ?? "",
      seller_name: `${sellerData?.name ?? ""} ${sellerData?.last_name ?? ""
        }`,
      seller_email: sellerData?.email ?? "",
      seller_phone: sellerData?.phone ?? "",
      discount_type: discount.type,
      discount_value: discount.value,
      discount_amount: discountAmount,
      surcharge_type: surcharge.type,
      surcharge_value: surcharge.value,
      surcharge_amount: surchargeAmount,
      deposit_paid: Boolean(lead?.deposit_paid),
      deposit_amount: depositData.amount,
      deposit_currency: depositData.currency,
      deposit_amount_ars: depositData.amountARS,
      total_original_ars: totalWithSurcharge,
      total_due_ars: totalDue,
      total_final_ars: totalDue,
    };

    setInvoiceData(salePreview);
    setInvoiceOpen(true);
    onOpenChange(false);
  };

  // ========== RENDER ==========
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>Nueva venta</SheetTitle>
              <SheetDescription>
                Completá los 3 pasos para registrar la venta.
              </SheetDescription>
            </div>
            <IconReceipt2 className="absolute right-12 top-6 h-6 w-6 text-primary" />
          </div>

          {/* Wizard header */}
          <div className="flex items-center justify-center mt-3 border-b pb-2">
            <div className="flex items-center gap-2 text-sm">
              <span className={step >= 1 ? "font-semibold text-primary" : ""}>
                1. Cliente
              </span>
              <IconChevronRight className="h-4 w-4" />
              <span className={step >= 2 ? "font-semibold text-primary" : ""}>
                2. Productos
              </span>
              <IconChevronRight className="h-4 w-4" />
              <span className={step === 3 ? "font-semibold text-primary" : ""}>
                3. Pago
              </span>
            </div>
            {/* <div className="flex gap-2">
              {step > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                >
                  <IconChevronLeft className="h-4 w-4 mr-1" />
                  Volver
                </Button>
              )}
              {/* {step < 3 && (
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  Siguiente
                  <IconChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )} 
            </div> */}
          </div>
        </SheetHeader>

        <div className=" px-4 sm:px-4">
          {/* ========== PASO 1: CLIENTE ========== */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium ">Seleccionar cliente</h3>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Buscar cliente..."
                    readOnly={!!lead}
                    value={
                      selectedCustomer
                        ? formatPersonName(
                            selectedCustomer.name,
                            selectedCustomer.last_name
                          )
                        : searchCustomer
                    }
                    onFocus={() => !lead && setFocusCustomer(true)}
                    onBlur={() =>
                      !lead && setTimeout(() => setFocusCustomer(false), 160)
                    }
                    onChange={(e) => {
                      if (!lead) {
                        setSelectedCustomer(null);
                        setSearchCustomer(e.target.value);
                      }
                    }}
                  />
                  {!lead && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setDialogCustomerOpen(true)}
                      title="Nuevo cliente"
                    >
                      <IconUserPlus className="h-5 w-5" />
                    </Button>
                  )}
                </div>
                {focusCustomer && !lead && (
                  <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                    <ScrollArea className="max-h-[250px] overflow-y-auto">
                      {(customers || []).length > 0 ? (
                    customers.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setFocusCustomer(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                      >
                        <div className="font-medium">
                          {formatPersonName(c.name, c.last_name)}
                        </div>
                            <div className="text-xs text-muted-foreground">
                              DNI: {c.dni || "N/D"} •{" "}
                              Contacto: {c.phone || c.email || "Sin contacto"} •{" "}
                              Nota: {c.notes ? `${c.notes}` : "Sin notas"}
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
                    placeholder={lead ? "Asignado desde el lead" : "Buscar vendedor..."}
                    disabled={!!lead}
                    value={
                      selectedSeller
                        ? `${selectedSeller.name ?? ""} ${selectedSeller.last_name ?? ""}`.trim()
                        : searchSeller
                    }
                    onChange={(e) => {
                      if (lead) return;
                      setSelectedSeller(null);
                      setSearchSeller(e.target.value);
                    }}
                    onFocus={() => !lead && setFocusSeller(true)}
                    onBlur={() => !lead && setTimeout(() => setFocusSeller(false), 150)}
                  />

                  {focusSeller && !lead && (
                    <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                      <ScrollArea className="max-h-[240px] overflow-y-auto">
                        {filteredSellers.length > 0 ? (
                          filteredSellers.map((s) => (
                            <button
                              type="button"
                              key={s.id_auth || s.id}
                              onClick={() => {
                                setSelectedSeller(s);
                                setSearchSeller("");
                                setFocusSeller(false);
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
                {lead && (
                  <p className="text-xs text-muted-foreground">
                    Vendedor asignado automáticamente por el lead.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="mb-3 font-medium">Canal de venta</h3>
                <Select
                  value={selectedChannel}
                  onValueChange={setSelectedChannel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar canal de venta" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {salesChannels.map((channel) => (
                      <SelectItem key={channel.id} value={String(channel.id)}>
                        {channel.name}
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

          {/* ========== PASO 2: PRODUCTOS / CARRITO ========== */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium ">Seleccionar productos</h3>

              {/* Codigo de barras */}
              <div className="space-y-1">
                <div className="relative">
                  <IconScan className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={barcodeInputRef}
                    className="pl-9"
                    placeholder="Escanear o escribir codigo de barras..."
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleBarcodeSubmit();
                      }
                    }}
                    disabled={barcodeLoading}
                  />
                </div>
                {barcodeLoading && (
                  <p className="text-xs text-muted-foreground">
                    Buscando codigo de barras...
                  </p>
                )}
              </div>

              {/* Producto */}
              <div className="relative">
                <Input
                  placeholder="Buscar producto..."
                  value={selectedProduct ? selectedProduct.name : searchProduct}
                  onFocus={() => setFocusProduct(true)}
                  onBlur={() => setTimeout(() => setFocusProduct(false), 160)}
                  onChange={(e) => {
                    setSelectedProduct(null);
                    setSearchProduct(e.target.value);
                  }}
                />
                {focusProduct && (
                  <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                    <ScrollArea className="max-h-[250px] overflow-y-auto">
                      {(products || []).length > 0 ? (
                        products.map((p) => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                            onClick={() => {
                              if (Number(p.stock || 0) <= 0) {
                                toast.warning("Producto sin stock");
                                return;
                              }
                              setSelectedProduct(p);
                              setFocusProduct(false);
                              setSearchProduct("");
                              setVariants([]);
                            }}
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

              {/* Variantes */}
              <div className="relative">
                <Input
                  placeholder={
                    selectedProduct
                      ? "Buscar variantes disponibles..."
                      : "Selecciona un producto primero"
                  }
                  value={searchVariant}
                  onFocus={() => setFocusVariant(true)}
                  onBlur={() => setTimeout(() => setFocusVariant(false), 160)}
                  onChange={(e) => setSearchVariant(e.target.value)}
                  disabled={!selectedProduct}
                />
                {focusVariant && selectedProduct && (
                  <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                    <ScrollArea className="max-h-[250px] overflow-y-auto">
                      {(variants || []).length > 0 ? (
                        variants.map((v) => (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => handleAddVariant(v)}
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                          >
                            <div className="font-medium">
                              {v.products?.name} - {v.variant_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {v.color || ""} • Stock: {v.stock} • USD{" "}
                              {v.usd_price}
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

              {/* Carrito */}
              {selectedVariants.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <h4 className="text-sm font-semibold">Carrito de venta</h4>

                  {selectedVariants.map((v) => {
                    const quantity = getVariantQuantity(v);
                    const isSerialTracked = isSerialTrackedVariant(v);

                    return (
                      <div
                        key={v.id}
                        className="border rounded-lg p-3 space-y-3 bg-muted/20"
                      >
                        {/* Header del item */}
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-2">
                            <div>
                              <div className="font-medium text-sm">
                                {v.products?.name} — {v.variant_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {v.color} • Stock: {v.stock}
                                {v.storage ? ` • ${v.storage}GB` : ""}
                                {v.ram ? ` • ${v.ram} RAM` : ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                              <Checkbox
                                checked={v.isFree}
                                onCheckedChange={() => handleToggleFree(v.id)}
                              />
                              <span className={v.isFree ? "text-green-600 font-medium" : "text-muted-foreground"}>
                                Regalo
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(v.id)}
                              className="p-1 rounded hover:bg-red-50 text-red-600"
                              title="Quitar"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Unidades / cantidad */}
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Cantidad ({quantity})
                          </label>

                          <div className="space-y-2 mt-1">
                            {isSerialTracked ? (
                              <>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Escanear o escribir IMEI/SN"
                                    value={v.serialSearch || ""}
                                    onChange={(e) =>
                                      handleSerialSearchChange(v.id, e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSerialUnitSubmit(v.id);
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleSerialUnitSubmit(v.id)}
                                  >
                                    Agregar
                                  </Button>
                                </div>

                                {(v.imeis || []).length > 0 ? (
                                  (v.imeis || []).map((imei, idx) => (
                                    <div key={`${v.id}-${imei}-${idx}`} className="flex gap-2 items-center">
                                      <Input value={imei} readOnly />
                                      <Button
                                        variant="destructive"
                                        size="icon"
                                        onClick={() => removeSerialUnit(v.id, idx)}
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
                                  onClick={() =>
                                    handleQuantityChange(v.id, Math.max(quantity - 1, 1))
                                  }
                                >
                                  <IconChevronLeft className="h-4 w-4" />
                                </Button>
                                <Input
                                  type="number"
                                  min="1"
                                  value={quantity}
                                  onChange={(e) =>
                                    handleQuantityChange(v.id, e.target.value)
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleQuantityChange(v.id, quantity + 1)}
                                >
                                  <IconChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Subtotal */}
                        <div className="flex justify-between pt-2 border-t">
                          <div className="text-xs text-muted-foreground">
                            Subtotal ({quantity}u)
                          </div>

                          <div className="text-right">
                            {v.isFree ? (
                              <div className="text-sm font-semibold text-green-600">
                                SIN COSTO
                              </div>
                            ) : (
                              <>
                                <div className="text-sm font-semibold">
                                  {formatARS(getPriceUSD(v) * quantity * exchangeRate)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  USD {getPriceUSD(v)} × {quantity}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex justify-between border-t pt-3 text-sm font-medium">
                    <span>Total:</span>
                    <span>{formatARS(baseTotal)}</span>
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="outline"
                      disabled={selectedVariants.length === 0}
                      onClick={() => setStep((s) => s - 1)}
                    >
                      <IconChevronLeft className="h-4 w-4" />
                      Volver
                    </Button>

                    <Button
                      disabled={selectedVariants.length === 0}
                      onClick={() => {
                        const missingSerial = selectedVariants.find(
                          (variant) =>
                            isSerialTrackedVariant(variant) &&
                            getVariantQuantity(variant) === 0
                        );
                        if (missingSerial) {
                          toast.error("Debes seleccionar las unidades serializadas antes de continuar");
                          return;
                        }

                        const invalidQuantity = selectedVariants.find(
                          (variant) =>
                            !isSerialTrackedVariant(variant) &&
                            getVariantQuantity(variant) <= 0
                        );
                        if (invalidQuantity) {
                          toast.error("Todas las cantidades deben ser mayores a cero");
                          return;
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

            </div>
          )}

          {/* ========== PASO 3: PAGO ========== */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="border p-3 rounded-md bg-muted/20 space-y-2">
                <label className="text-sm font-medium">Tipo de precio</label>

                <Select
                  value={priceType}
                  onValueChange={(v) => setPriceType(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo de precio" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="normal">Precio Normal</SelectItem>
                    <SelectItem value="mayorista">Precio Mayorista</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border p-3 rounded-md bg-muted/20 space-y-2">
                <label className="text-sm font-medium">Descuento</label>

                <div className="flex gap-2">
                  <Select
                    value={discount.type}
                    onValueChange={(v) =>
                      setDiscount((d) => ({ ...d, type: v, value: 0 }))
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="none">Sin descuento</SelectItem>
                      <SelectItem value="percent">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Monto fijo ($)</SelectItem>
                    </SelectContent>
                  </Select>

                  {discount.type !== "none" && (
                    <Input
                      type="number"
                      placeholder={discount.type === "percent" ? "% descuento" : "$ descuento"}
                      value={discount.value}
                      onChange={(e) =>
                        setDiscount((d) => ({ ...d, value: Number(e.target.value) }))
                      }
                      className="flex-1"
                    />
                  )}
                </div>
              </div>

              <div className="border p-3 rounded-md bg-muted/20 space-y-2">
                <label className="text-sm font-medium">Recargo</label>

                <div className="flex gap-2">
                  <Select
                    value={surcharge.type}
                    onValueChange={(v) =>
                      setSurcharge((s) => ({ ...s, type: v, value: 0 }))
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="none">Sin recargo</SelectItem>
                      <SelectItem value="percent">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Monto fijo ($)</SelectItem>
                    </SelectContent>
                  </Select>

                  {surcharge.type !== "none" && (
                    <Input
                      type="number"
                      placeholder={
                        surcharge.type === "percent"
                          ? "% recargo"
                          : "$ recargo"
                      }
                      value={surcharge.value}
                      onChange={(e) =>
                        setSurcharge((s) => ({
                          ...s,
                          value: Number(e.target.value),
                        }))
                      }
                      className="flex-1"
                    />
                  )}
                </div>
              </div>


              <h3 className="font-medium">Métodos de Pago</h3>

              {payments.map((p, i) => {
                const accountsForPayment = getAccountsForPayment(p);
                return (
                <div
                  key={i}
                  className="border p-3 rounded-md space-y-3 bg-muted/40"
                >
                  {/* Selects arriba */}
                  <div className="flex items-center gap-2">
                    {methodIcon(p.method)}

                    <Select
                      value={
                        p.payment_method_id ? String(p.payment_method_id) : ""
                      }
                      onValueChange={(val) => {
                        // 🔥 1. Verificar si ya existe este método en otra fila
                        const alreadyUsed = payments.some(
                          (p, idx) => idx !== i && String(p.payment_method_id) === val
                        );

                        if (alreadyUsed) {
                          toast.error("Ese método de pago ya está agregado.");
                          return; // ❌ No actualizar
                        }

                        // 🔥 2. Si no está repetido, actualizar normalmente:
                        const chosen = paymentMethods.find((m) => String(m.id) === val);

                        updatePaymentField(i, "payment_method_id", val);
                        updatePaymentField(i, "method_name", chosen?.name);
                        updatePaymentField(i, "method", chosen?.name.toLowerCase());
                        updatePaymentField(i, "installments", "");
                        updatePaymentField(i, "multiplier", chosen?.multiplier || 1);
                        updatePaymentField(i, "amount", "");
                        const accountsForMethod = getAccountsForPayment({
                          method_name: chosen?.name,
                        });
                        if (accountsForMethod.length === 1) {
                          updatePaymentField(
                            i,
                            "account_id",
                            String(accountsForMethod[0].id)
                          );
                        } else {
                          updatePaymentField(i, "account_id", "");
                        }
                      }}

                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Método de pago..." />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]">
                        {paymentMethods.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {getInstallmentsForMethod(p.payment_method_id).length >
                      0 && (
                        <Select
                          value={p.installments || ""}
                          onValueChange={(val) => {
                            const inst = getInstallmentsForMethod(
                              p.payment_method_id
                            ).find((x) => x.installments === Number(val));
                            updatePaymentField(i, "installments", val);
                            updatePaymentField(
                              i,
                              "multiplier",
                              inst?.multiplier || 1
                            );
                            updatePaymentField(i, "amount", "");
                          }}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="Cuotas" />
                          </SelectTrigger>
                          <SelectContent className="z-[9999]">
                            {getInstallmentsForMethod(p.payment_method_id).map(
                              (inst) => (
                                <SelectItem
                                  key={inst.id}
                                  value={inst.installments.toString()}
                                >
                                  {inst.installments} cuotas
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      )}

                    {payments.length > 1 && (
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => removePaymentRow(i)}
                        title="Eliminar"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Inputs debajo */}
                  <div className="grid gap-2">
                    <div className="grid gap-2">
                      <Select
                        value={p.account_id ? String(p.account_id) : ""}
                        onValueChange={(val) =>
                          updatePaymentField(i, "account_id", val)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Cuenta..." />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {accountsForPayment.map((acc) => (
                            <SelectItem key={acc.id} value={String(acc.id)}>
                              {acc.name} ({acc.currency})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {accountsForPayment.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          No hay cuentas disponibles para esta moneda
                        </div>
                      )}
                      {p.payment_method_id && !p.account_id && (
                        <div className="text-xs text-destructive">
                          Selecciona una cuenta para este pago.
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 items-end">
                      <Input
                        className="flex-1"
                        placeholder={`Monto (${getPaymentDisplayCurrency(p.method_name)})`}
                        type="number"
                        value={p.amount}
                        onChange={(e) =>
                          updatePaymentField(i, "amount", e.target.value)
                        }
                      />
                      {i === payments.length - 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            !p.payment_method_id ||
                            (getInstallmentsForMethod(p.payment_method_id)
                              .length > 0 &&
                              !p.installments)
                          }
                          onClick={() => {
                            if (
                              !p.payment_method_id ||
                              (getInstallmentsForMethod(p.payment_method_id)
                                .length > 0 &&
                                !p.installments)
                            ) {
                              return;
                            }
                            if (isUSDMethod(p.method_name)) {
                              const rate = getPaymentFxRate(p.method_name);
                              if (!rate) {
                                const label = getPaymentDisplayCurrency(p.method_name);
                                toast.error(`No hay cotizacion activa para ${label}`);
                                return;
                              }
                              // Si es USD/USDT, convertir el remaining (ARS) a esa moneda
                              const remainingUSD = remaining / rate;
                              updatePaymentField(i, "amount", String(remainingUSD.toFixed(2)));
                              return;
                            }
                            updatePaymentField(i, "amount", String(remaining));
                          }}
                        >
                          Restante
                        </Button>
                      )}
                    </div>

                    {p.method === "transferencia" && (
                      <Input
                        placeholder="Referencia de transferencia"
                        value={p.reference || ""}
                        onChange={(e) =>
                          updatePaymentField(i, "reference", e.target.value)
                        }
                      />
                    )}
                  </div>
                </div>
                );
              })}

              <Button
                variant="outline"
                onClick={addPaymentRow}
                className="w-full"
              >
                <IconCirclePlus className="h-4 w-4 mr-1" />
                Agregar otro pago
              </Button>

              {/* Totales */}
              <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
                <div className="text-muted-foreground">Subtotal USD:</div>
                <div className="text-right font-semibold">
                  {subtotalUSD.toFixed(2)} USD
                </div>

                <div className="text-muted-foreground">Cotización:</div>
                <div className="text-right">${exchangeRate}</div>

                <div className="text-muted-foreground">Total base ARS:</div>
                <div className="text-right font-semibold">
                  {formatARS(baseTotal)}
                </div>

                {payments.map((p, i) => {
                  if (!p.payment_method_id) return null;
                  const amount = Number(p.amount || 0);
                  const displayCurrency = getPaymentDisplayCurrency(p.method_name);
                  const isUsdLike = displayCurrency !== "ARS";
                  const isUSD = false;
                  const displayAmount = isUsdLike
                    ? `${displayCurrency} ${amount.toFixed(2)}`
                    : formatARS(amount);
                  const rate = isUsdLike ? getPaymentFxRate(p.method_name) : 1;
                  const arsEquivalent = isUsdLike && rate ? amount * rate : amount;
                  
                  return (
                    <div key={i} className="col-span-2 flex justify-between">
                      <div className="text-muted-foreground">
                        {p.method_name || "Método"}:
                      </div>
                      <div className="text-right">
                        <div>{displayAmount}</div>
                        {isUsdLike && rate && (
                          <div className="text-xs text-muted-foreground">
                            {formatARS(arsEquivalent)}
                          </div>
                        )}
                        {isUSD && <div className="text-xs text-muted-foreground">≈ {formatARS(arsEquivalent)}</div>}
                      </div>
                    </div>
                  );
                })}

                {/* Subtotal real con recargos */}
                <div className="text-muted-foreground">
                  Subtotal con recargos:
                </div>
                <div className="text-right font-semibold">
                  {formatARS(subtotalWithSurcharge)}
                </div>

                {/* Descuento */}
                {discount.type !== "none" && discountAmount > 0 && (
                  <>
                    <div className="text-muted-foreground">Descuento aplicado:</div>
                    <div className="text-right text-green-600 font-semibold">
                      − {formatARS(discountAmount)}
                    </div>
                  </>
                )}

                {surcharge.type !== "none" && surchargeAmount > 0 && (
                  <>
                    <div className="text-muted-foreground">Recargo aplicado:</div>
                    <div className="text-right text-orange-600 font-semibold">
                      {formatARS(surchargeAmount)}
                    </div>
                  </>
                )}

                {depositData.amountARS > 0 && (
                  <>
                    <div className="text-muted-foreground">Seña aplicada:</div>
                    <div className="text-right text-amber-600 font-semibold">
                      <div>{formatARS(depositData.amountARS)}</div>
                      {depositData.currency === "USD" && depositData.amount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          USD {depositData.amount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Total final */}
                <div className="text-muted-foreground font-medium border-t mt-2 pt-2">
                  Total a pagar ahora:
                </div>
                <div className="text-right font-bold text-primary border-t mt-2 pt-2">
                  {formatARS(totalDue)}
                </div>


                <div className="text-muted-foreground">Pagado:</div>
                <div
                  className={`text-right font-semibold ${Math.round(paidARS) === Math.round(totalDue)
                    ? "text-green-600"
                    : "text-red-600"
                    }`}
                >
                  <div>{formatARS(paidARS)}</div>
                  {payments.some(p => isUSDMethod(p.method_name)) && (
                    <div className="text-xs text-muted-foreground">
                      {payments.filter(p => isUSDMethod(p.method_name)).map((p, i) => {
                        const displayCurrency = getPaymentDisplayCurrency(p.method_name);
                        const amount = Number(p.amount || 0);
                        const displayAmount = `${displayCurrency} ${amount.toFixed(2)}`;
                        return (
                          <div key={i}>
                            {displayAmount} ({p.method_name})
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="text-muted-foreground">Restante:</div>
                <div
                  className={`text-right font-bold ${remaining === 0 ? "text-green-600" : "text-blue-600"
                    }`}
                >
                  {formatARS(remaining)}
                </div>
              </div>

              <Textarea
                placeholder="Notas de la operación (opcional)"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />

              {/* ✅ Botón Volver + Finalizar */}
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  className=""
                  onClick={() => setStep(2)}
                >
                  <IconChevronLeft className="h-4 w-4 mr-1" />
                  Volver
                </Button>

                <Button
                  className=""
                  disabled={loading || hasMissingAccount}
                  onClick={handleSubmit}
                >
                  {loading ? "Guardando..." : "Finalizar"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <SheetFooter />
      </SheetContent>

      {/* Comprobante / Factura */}
      {invoiceData && (
        <DialogSaleInvoice
          open={invoiceOpen}
          onClose={() => setInvoiceOpen(false)}
          sale={{ ...invoiceData, reset: resetFormData }}
          subtotalWithSurcharge={subtotalWithSurcharge}
        />
      )}

      {/* 💬 Modal para crear cliente */}
      <DialogAddCustomer
        open={dialogCustomerOpen}
        onClose={() => setDialogCustomerOpen(false)}
        onSuccess={(newCustomer) => {
          setSelectedCustomer(newCustomer);
          setDialogCustomerOpen(false);
          toast.success(
            `Cliente ${formatPersonName(
              newCustomer.name,
              newCustomer.last_name
            )} agregado correctamente`
          );
        }}
      />
    </Sheet>
  );
}
