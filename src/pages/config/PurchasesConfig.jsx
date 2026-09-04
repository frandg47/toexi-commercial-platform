import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContextProvider";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  IconCalendar,
  IconDotsVertical,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatUSDT = (n) =>
  `USDT ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;

const formatByCurrency = (currency, amount) => {
  if (currency === "USD") return `USD ${Number(amount || 0).toFixed(2)}`;
  if (currency === "USDT") return formatUSDT(amount);
  return formatARS(amount);
};

const getRateForCurrency = (currency, fxRate, usdtRate) => {
  if (currency === "USD") return fxRate;
  if (currency === "USDT") return usdtRate;
  return 1;
};

const resolveManualRate = (currency, manualRate) => {
  const safeManualRate = Number(manualRate || 0);
  if (!safeManualRate) return null;
  if (currency === "USD" || currency === "USDT") return safeManualRate;
  return 1;
};

const getEffectiveRateForCurrency = (
  currency,
  rateMode,
  manualFxRate,
  fxRate,
  usdtRate,
) => {
  if (currency === "ARS") return 1;
  if (rateMode === "manual") {
    return resolveManualRate(currency, manualFxRate);
  }
  return getRateForCurrency(currency, fxRate, usdtRate);
};

const convertAmountToARS = (amount, currency, fxRate, usdtRate) => {
  const numericAmount = Number(amount || 0);
  if (!numericAmount) return 0;
  if (currency === "ARS") return numericAmount;

  const rate = getRateForCurrency(currency, fxRate, usdtRate);
  if (!rate) return NaN;
  return numericAmount * rate;
};

const normalizeIdentifier = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseIdentifiers = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const isSerialTrackedVariant = (variant) =>
  variant?.products?.inventory_tracking_mode === "serial";

const PurchasesConfig = () => {
  const { role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";
  const [providers, setProviders] = useState([]);
  const [variants, setVariants] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [fxRate, setFxRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPurchase, setDetailPurchase] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    providerId: "all",
    currency: "all",
  });
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelingPurchase, setCancelingPurchase] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelingProcess, setCancelingProcess] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completingPurchase, setCompletingPurchase] = useState(null);
  const [completeItems, setCompleteItems] = useState([]);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completePayments, setCompletePayments] = useState([
    { account_id: "", amount: "" },
  ]);
  const [completeSerialText, setCompleteSerialText] = useState("");
  const [completeActiveItem, setCompleteActiveItem] = useState(null);
  const [completeAddingPayment, setCompleteAddingPayment] = useState(false);
  const [completeAddingSerials, setCompleteAddingSerials] = useState(false);

  const [form, setForm] = useState({
    provider_id: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    currency: "ARS",
    notes: "",
    rate_mode: "system",
    manual_fx_rate: "",
  });
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([{ account_id: "", amount: "" }]);
  const [searchVariant, setSearchVariant] = useState("");
  const [focusVariant, setFocusVariant] = useState(false);

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("purchases")
      .select(
        "id, provider_id, purchase_date, total_amount, currency, total_amount_ars, fx_rate_used, notes, status, void_reason, voided_at, providers(name), purchase_payments(id, account_id, amount, currency, amount_ars, fx_rate_used)",
      )
      .order("purchase_date", { ascending: false })
      .order("id", { ascending: false });

    if (filters.providerId !== "all") {
      query = query.eq("provider_id", filters.providerId);
    }
    if (filters.currency !== "all") {
      query = query.eq("currency", filters.currency);
    }
    if (dateRange?.from) {
      query = query.gte(
        "purchase_date",
        dateRange.from.toISOString().slice(0, 10),
      );
    }
    if (dateRange?.to) {
      query = query.lte(
        "purchase_date",
        dateRange.to.toISOString().slice(0, 10),
      );
    }

    const { data, error } = await query;

    if (error) {
      toast.error("No se pudieron cargar las compras", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    setPurchases(data || []);
    setLoading(false);
  }, [dateRange, filters.currency, filters.providerId]);

  useEffect(() => {
    const loadBaseData = async () => {
      const [
        { data: prov },
        { data: vars },
        { data: rate },
        { data: usdt },
        { data: accountsData },
      ] = await Promise.all([
        supabase.from("providers").select("id, name").order("name"),
        supabase
          .from("product_variants")
          .select(
            "id, variant_name, color, storage, ram, products(name, active, inventory_tracking_mode)",
          )
          .eq("active", true)
          .order("id", { ascending: true }),
        supabase
          .from("fx_rates")
          .select("rate")
          .eq("is_active", true)
          .eq("source", "blue")
          .maybeSingle(),
        supabase
          .from("fx_rates")
          .select("rate")
          .eq("is_active", true)
          .eq("source", "USDT")
          .maybeSingle(),
        supabase
          .from("accounts")
          .select(
            "id, name, currency, is_reference_capital, is_efectivo, is_caja_virtual, active",
          )
          .eq("is_reference_capital", false)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      setProviders(prov || []);
      setVariants(
        (vars || []).filter((variant) => variant.products?.active !== false),
      );
      setFxRate(rate?.rate ? Number(rate.rate) : null);
      setUsdtRate(usdt?.rate ? Number(usdt.rate) : null);
      setAccounts(accountsData || []);
    };

    loadBaseData();
  }, []);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    const checkRegister = async () => {
      const { data } = await supabase
        .from("cash_registers")
        .select("id")
        .eq("status", "open")
        .maybeSingle();
      setIsRegisterOpen(!!data);
    };
    checkRegister();
  }, []);

  const displayAccounts = useMemo(() => {
    if (isRegisterOpen)
      return accounts.filter((a) => !a.is_efectivo && !a.is_caja_virtual);
    return accounts;
  }, [accounts, isRegisterOpen]);

  const totalAmount = useMemo(() => {
    return items.reduce(
      (acc, item) =>
        acc + Number(item.quantity || 0) * Number(item.unit_cost || 0),
      0,
    );
  }, [items]);

  const totalAmountArs = useMemo(() => {
    const rate = getEffectiveRateForCurrency(
      form.currency,
      form.rate_mode,
      form.manual_fx_rate,
      fxRate,
      usdtRate,
    );
    if (form.currency !== "ARS" && !rate) return NaN;
    return form.currency === "ARS" ? totalAmount : totalAmount * rate;
  }, [
    form.currency,
    form.manual_fx_rate,
    form.rate_mode,
    fxRate,
    totalAmount,
    usdtRate,
  ]);

  const totalPaid = useMemo(
    () =>
      payments.reduce((acc, payment) => {
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || ""),
        );
        const currency = account?.currency || form.currency;
        const amountArs = convertAmountToARS(
          payment.amount,
          currency,
          form.rate_mode === "manual"
            ? resolveManualRate("USD", form.manual_fx_rate)
            : fxRate,
          form.rate_mode === "manual"
            ? resolveManualRate("USDT", form.manual_fx_rate)
            : usdtRate,
        );
        return acc + (Number.isFinite(amountArs) ? amountArs : 0);
      }, 0),
    [
      displayAccounts,
      form.currency,
      form.manual_fx_rate,
      form.rate_mode,
      fxRate,
      payments,
      usdtRate,
    ],
  );

  const handleAddItem = (variant) => {
    if (items.some((i) => i.variant_id === variant.id)) return;
    setItems((prev) => [
      ...prev,
      {
        variant_id: variant.id,
        variant,
        quantity: 1,
        unit_cost: "",
        identifiersText: "",
      },
    ]);
    setSearchVariant("");
  };

  const handleUpdateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((i) => (i.variant_id === id ? { ...i, [field]: value } : i)),
    );
  };

  const handleRemoveItem = (id) => {
    setItems((prev) => prev.filter((i) => i.variant_id !== id));
  };

  const handleAddPayment = () => {
    setPayments((current) => [...current, { account_id: "", amount: "" }]);
  };

  const handleUpdatePayment = (index, field, value) => {
    setPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, [field]: value } : payment,
      ),
    );
  };

  const handleRemovePayment = (index) => {
    setPayments((current) => {
      if (current.length === 1) return [{ account_id: "", amount: "" }];
      return current.filter((_, paymentIndex) => paymentIndex !== index);
    });
  };

  const handleSave = async () => {
    if (!form.provider_id) return toast.error("Selecciona un proveedor");
    if (!items.length) return toast.error("Agrega al menos un producto");
    if (
      items.some(
        (item) =>
          Number(item.quantity || 0) <= 0 || Number(item.unit_cost || 0) < 0,
      )
    ) {
      return toast.error(
        "Completa cantidades y costos validos para todos los items",
      );
    }
    if (
      payments.some(
        (payment) =>
          payment.account_id &&
          (!payment.account_id || Number(payment.amount || 0) <= 0),
      )
    ) {
      return toast.error("Si agregas un pago, completa cuenta y monto");
    }
    if (
      payments.some((payment) => {
        if (!payment.account_id || Number(payment.amount || 0) <= 0)
          return false;
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || ""),
        );
        if (!account) return true;
        if (
          account.currency !== "ARS" &&
          !getEffectiveRateForCurrency(
            account.currency,
            form.rate_mode,
            form.manual_fx_rate,
            fxRate,
            usdtRate,
          )
        ) {
          return true;
        }
        return false;
      })
    ) {
      return toast.error(
        "Falta cotizacion activa para alguna de las cuentas elegidas",
      );
    }

    const currency = form.currency;
    const rate = getEffectiveRateForCurrency(
      currency,
      form.rate_mode,
      form.manual_fx_rate,
      fxRate,
      usdtRate,
    );
    if (currency !== "ARS" && !rate) {
      return toast.error(`No hay cotizacion activa para ${currency}`);
    }

    const duplicateIdentifiers = new Set();
    for (const item of items) {
      if (!isSerialTrackedVariant(item.variant)) continue;
      const identifiers = parseIdentifiers(item.identifiersText);
      for (const identifier of identifiers) {
        const normalized = normalizeIdentifier(identifier);
        if (!normalized) {
          return toast.error("Todos los IMEI/SN deben estar completos");
        }
        if (duplicateIdentifiers.has(normalized)) {
          return toast.error(
            `El IMEI/SN ${identifier} esta repetido en la compra`,
          );
        }
        duplicateIdentifiers.add(normalized);
      }
    }

    const paymentRows = payments
      .filter(
        (payment) => payment.account_id && Number(payment.amount || 0) > 0,
      )
      .map((payment) => {
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || ""),
        );
        const paymentAmount = Number(payment.amount || 0);
        const paymentCurrency = account?.currency || currency;
        const paymentRate = getEffectiveRateForCurrency(
          paymentCurrency,
          form.rate_mode,
          form.manual_fx_rate,
          fxRate,
          usdtRate,
        );
        return {
          account_id: Number(payment.account_id),
          payment_method_id: null,
          amount: paymentAmount,
          currency: paymentCurrency,
          amount_ars:
            paymentCurrency === "ARS"
              ? paymentAmount
              : paymentAmount * paymentRate,
          fx_rate_used: paymentCurrency === "ARS" ? null : paymentRate,
        };
      });

    const payloadItems = items.map((item) => ({
      variant_id: item.variant_id,
      quantity: Number(item.quantity || 0),
      unit_cost: Number(item.unit_cost || 0),
      identifiers: isSerialTrackedVariant(item.variant)
        ? parseIdentifiers(item.identifiersText)
        : [],
    }));

    const { error } = await supabase.rpc(
      "create_purchase_with_inventory_units",
      {
        p_provider_id: Number(form.provider_id),
        p_purchase_date: form.purchase_date,
        p_currency: currency,
        p_total_amount: totalAmount,
        p_total_amount_ars: totalAmountArs,
        p_fx_rate_used: currency === "ARS" ? null : rate,
        p_notes: form.notes || null,
        p_items: payloadItems,
        p_payments: paymentRows,
      },
    );

    if (error) {
      toast.error("No se pudo registrar la compra", {
        description: error.message,
      });
      return;
    }

    toast.success("Compra registrada");
    setForm((f) => ({
      ...f,
      notes: "",
      rate_mode: "system",
      manual_fx_rate: "",
    }));
    setItems([]);
    setPayments([{ account_id: "", amount: "" }]);

    await loadPurchases();
  };

  const openPurchaseDetail = async (purchase) => {
    if (!purchase?.id) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailPurchase(purchase);
    setDetailItems([]);

    const { data, error } = await supabase
      .from("purchase_items")
      .select(
        "id, quantity, unit_cost, subtotal, product_variants(variant_name, color, storage, ram, products(name, inventory_tracking_mode))",
      )
      .eq("purchase_id", purchase.id)
      .order("id", { ascending: true });

    if (error) {
      toast.error("No se pudieron cargar los items", {
        description: error.message,
      });
      setDetailLoading(false);
      return;
    }

    setDetailItems(data || []);
    setDetailLoading(false);
  };

  const handleWeekFilter = () => {
    setDateRange({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 }),
    });
  };

  const handleCancelPurchase = async () => {
    if (!cancelingPurchase?.id) return;
    if (!cancelReason.trim()) {
      toast.error("Debes ingresar un motivo de anulacion");
      return;
    }

    setCancelingProcess(true);
    try {
      const { error } = await supabase.rpc("void_purchase", {
        p_purchase_id: cancelingPurchase.id,
        p_reason: cancelReason.trim(),
      });

      if (error) throw error;

      setCancelOpen(false);
      setCancelReason("");
      setCancelingPurchase(null);
      toast.success("Compra anulada correctamente");
      await loadPurchases();
    } catch (error) {
      toast.error("No se pudo anular la compra", {
        description: error.message,
      });
    } finally {
      setCancelingProcess(false);
    }
  };

  const openCompletePurchase = async (purchase) => {
    if (!purchase?.id) return;
    if (purchase.status === "cancelled") {
      toast.error("No se puede completar una compra anulada");
      return;
    }

    setCompleteOpen(true);
    setCompleteLoading(true);
    setCompletingPurchase(purchase);
    setCompletePayments([{ account_id: "", amount: "" }]);
    setCompleteSerialText("");
    setCompleteActiveItem(null);

    const { data: itemsData, error: itemsError } = await supabase
      .from("purchase_items")
      .select(
        "id, variant_id, quantity, unit_cost, subtotal, product_variants(id, variant_name, color, storage, ram, products(name, inventory_tracking_mode))",
      )
      .eq("purchase_id", purchase.id)
      .order("id", { ascending: true });

    if (itemsError) {
      toast.error("No se pudieron cargar los items", {
        description: itemsError.message,
      });
      setCompleteLoading(false);
      return;
    }

    const itemsWithSerials = await Promise.all(
      (itemsData || []).map(async (item) => {
        if (
          item.product_variants?.products?.inventory_tracking_mode !== "serial"
        ) {
          return { ...item, enteredSerials: [], pendingCount: 0 };
        }
        const { data: serials } = await supabase
          .from("inventory_units")
          .select("id, identifier_value")
          .eq("purchase_item_id", item.id)
          .eq("status", "available");
        const entered = serials || [];
        return {
          ...item,
          enteredSerials: entered,
          pendingCount: item.quantity - entered.length,
        };
      }),
    );

    setCompleteItems(itemsWithSerials);
    setCompleteLoading(false);
  };

  const completeTotalPaid = useMemo(() => {
    if (!completingPurchase) return 0;
    return (
      completingPurchase.purchase_payments?.reduce(
        (acc, p) => acc + Number(p.amount_ars || 0),
        0,
      ) || 0
    );
  }, [completingPurchase]);

  const completeRemainingArs = useMemo(
    () =>
      Math.max(
        Number(completingPurchase?.total_amount_ars || 0) - completeTotalPaid,
        0,
      ),
    [completingPurchase, completeTotalPaid],
  );

  const completePendingSerials = useMemo(
    () => completeItems.filter((item) => item.pendingCount > 0),
    [completeItems],
  );

  const handleAddCompletePayment = async () => {
    const validPayments = completePayments.filter(
      (p) => p.account_id && Number(p.amount || 0) > 0,
    );
    if (validPayments.length === 0) {
      return toast.error("Agrega al menos un pago valido");
    }

    for (const payment of validPayments) {
      const account = displayAccounts.find(
        (a) => String(a.id) === String(payment.account_id),
      );
      if (!account) {
        return toast.error("Cuenta no encontrada");
      }
      if (
        account.currency !== "ARS" &&
        !getEffectiveRateForCurrency(
          account.currency,
          completingPurchase.rate_mode || "system",
          completingPurchase.manual_fx_rate,
          fxRate,
          usdtRate,
        )
      ) {
        return toast.error(`No hay cotizacion para ${account.currency}`);
      }
    }

    setCompleteAddingPayment(true);
    try {
      for (const payment of validPayments) {
        const account = displayAccounts.find(
          (a) => String(a.id) === String(payment.account_id),
        );
        const paymentCurrency =
          account?.currency || completingPurchase.currency;
        const paymentRate = getEffectiveRateForCurrency(
          paymentCurrency,
          completingPurchase.rate_mode || "system",
          completingPurchase.manual_fx_rate,
          fxRate,
          usdtRate,
        );
        const paymentAmount = Number(payment.amount || 0);

        const { error } = await supabase.rpc("add_purchase_payment", {
          p_purchase_id: completingPurchase.id,
          p_account_id: Number(payment.account_id),
          p_amount: paymentAmount,
          p_currency: paymentCurrency,
          p_amount_ars:
            paymentCurrency === "ARS"
              ? paymentAmount
              : paymentAmount * paymentRate,
          p_fx_rate_used: paymentCurrency === "ARS" ? null : paymentRate,
        });

        if (error) throw error;
      }

      toast.success("Pago/s agregado/s");
      setCompletePayments([{ account_id: "", amount: "" }]);

      const { data: updated } = await supabase
        .from("purchases")
        .select("id, status, purchase_payments(amount_ars)")
        .eq("id", completingPurchase.id)
        .single();

      if (updated) {
        setCompletingPurchase((prev) => ({
          ...prev,
          status: updated.status,
          purchase_payments: updated.purchase_payments,
        }));
      }

      await loadPurchases();
    } catch (err) {
      toast.error("No se pudo agregar el pago", {
        description: err.message,
      });
    } finally {
      setCompleteAddingPayment(false);
    }
  };

  const handleAddCompleteSerials = async () => {
    if (!completeActiveItem) return;
    const identifiers = parseIdentifiers(completeSerialText);
    if (identifiers.length === 0) {
      return toast.error("Ingresa al menos un IMEI/SN");
    }

    setCompleteAddingSerials(true);
    try {
      const { data, error } = await supabase.rpc("add_purchase_serials", {
        p_purchase_item_id: completeActiveItem.id,
        p_identifiers: identifiers,
      });

      if (error) throw error;

      toast.success(
        `${data?.inserted || identifiers.length} IMEI/SN agregados`,
      );

      const updatedItem = {
        ...completeActiveItem,
        enteredSerials: [
          ...completeActiveItem.enteredSerials,
          ...identifiers.map((id) => ({ identifier_value: id })),
        ],
        pendingCount: Math.max(
          completeActiveItem.pendingCount - identifiers.length,
          0,
        ),
      };
      setCompleteItems((prev) =>
        prev.map((item) =>
          item.id === completeActiveItem.id ? updatedItem : item,
        ),
      );
      setCompleteActiveItem(updatedItem);
      setCompleteSerialText("");

      const { data: purchaseData } = await supabase
        .from("purchases")
        .select("id, status")
        .eq("id", completingPurchase.id)
        .single();

      if (purchaseData) {
        setCompletingPurchase((prev) => ({
          ...prev,
          status: purchaseData.status,
        }));
      }

      await loadPurchases();
    } catch (err) {
      toast.error("No se pudieron agregar los IMEIs", {
        description: err.message,
      });
    } finally {
      setCompleteAddingSerials(false);
    }
  };

  const getPurchaseStatusBadge = (status) => {
    if (status === "cancelled") {
      return (
        <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
          ANULADA
        </Badge>
      );
    }
    if (status === "completed") {
      return (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
          COMPLETADA
        </Badge>
      );
    }
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
        INCOMPLETA
      </Badge>
    );
  };

  if (!isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  const filteredVariants = variants.filter((v) => {
    const name =
      `${v.products?.name || ""} ${v.variant_name || ""} ${v.color || ""}`
        .toLowerCase()
        .trim();
    return name.includes(searchVariant.toLowerCase());
  });

  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 min-w-[220px]"
                    >
                      <IconCalendar className="h-4 w-4" />
                      {dateRange?.from && dateRange?.to
                        ? `${dateRange.from.toLocaleDateString("es-AR")} - ${dateRange.to.toLocaleDateString("es-AR")}`
                        : "Filtrar por fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-3" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={setDateRange}
                      locale={es}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-1">
                <Button variant="outline" onClick={handleWeekFilter}>
                  Semana actual
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 md:justify-end">
              <div className="grid gap-1">
                <Select
                  value={filters.providerId}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, providerId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Proveedor" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="all">Todos los prov.</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Select
                  value={filters.currency}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, currency: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Moneda" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="all">Todas las mon.</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={loadPurchases}
                  disabled={loading}
                  variant="outline"
                >
                  <IconRefresh className="h-4 w-4" />
                  {loading ? "Cargando..." : "Actualizar"}
                </Button>
              </div>
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow
                    key={p.id}
                    className={`cursor-pointer ${p.status === "cancelled" ? "bg-rose-50/50" : ""}`}
                    onClick={() => openPurchaseDetail(p)}
                  >
                    <TableCell>{p.purchase_date}</TableCell>
                    <TableCell>{p.providers?.name || "-"}</TableCell>
                    <TableCell>{getPurchaseStatusBadge(p.status)}</TableCell>
                    <TableCell>
                      {p.currency === "USD"
                        ? `USD ${Number(p.total_amount || 0).toFixed(2)}`
                        : p.currency === "USDT"
                          ? formatUSDT(p.total_amount)
                          : formatARS(p.total_amount)}
                    </TableCell>
                    <TableCell>{p.notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <IconDotsVertical size={18} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={p.status === "cancelled"}
                            onClick={(event) => {
                              event.stopPropagation();
                              openCompletePurchase(p);
                            }}
                          >
                            <IconEdit className="mr-2 h-4 w-4" />
                            Completar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={p.status === "cancelled"}
                            className="text-rose-700 focus:text-rose-700"
                            onClick={(event) => {
                              event.stopPropagation();
                              setCancelingPurchase(p);
                              setCancelReason("");
                              setCancelOpen(true);
                            }}
                          >
                            <IconTrash className="mr-2 h-4 w-4" />
                            Anular
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      No hay compras registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Registrar compra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="grid gap-1">
              <Label
                htmlFor="purchase-date"
                className="text-xs text-muted-foreground"
              >
                Fecha
              </Label>
              <Input
                id="purchase-date"
                type="date"
                value={form.purchase_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, purchase_date: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label
                htmlFor="purchase-provider"
                className="text-xs text-muted-foreground"
              >
                Proveedor
              </Label>
              <Select
                value={form.provider_id}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, provider_id: value }))
                }
              >
                <SelectTrigger id="purchase-provider">
                  <SelectValue placeholder="Proveedor" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label
                htmlFor="purchase-currency"
                className="text-xs text-muted-foreground"
              >
                Moneda
              </Label>
              <Select
                value={form.currency}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, currency: value }))
                }
              >
                <SelectTrigger id="purchase-currency">
                  <SelectValue placeholder="Moneda" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label
                htmlFor="purchase-total"
                className="text-xs text-muted-foreground"
              >
                Total
              </Label>
              <Input
                id="purchase-total"
                placeholder="Total"
                value={formatByCurrency(form.currency, totalAmount)}
                readOnly
              />
            </div>
            <div className="grid gap-1">
              <Label
                htmlFor="purchase-paid"
                className="text-xs text-muted-foreground"
              >
                Pagado
              </Label>
              <Input
                id="purchase-paid"
                value={totalPaid > 0 ? formatARS(totalPaid) : "Sin pagos"}
                readOnly
              />
            </div>
          </div>

          <div className="relative">
            <Input
              placeholder="Buscar producto/variante..."
              value={searchVariant}
              onFocus={() => setFocusVariant(true)}
              onBlur={() => setTimeout(() => setFocusVariant(false), 200)}
              onChange={(e) => setSearchVariant(e.target.value)}
            />
            {focusVariant && searchVariant && (
              <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                <div className="max-h-64 overflow-y-auto">
                  {filteredVariants.length > 0 ? (
                    filteredVariants.slice(0, 40).map((v) => (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() => handleAddItem(v)}
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                      >
                        <div className="font-medium">
                          {v.products?.name} {v.variant_name} {v.color}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isSerialTrackedVariant(v)
                            ? "Serializado: requiere IMEI/SN por unidad"
                            : "Por cantidad"}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Sin coincidencias
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Costo unit.</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.variant_id}>
                    <TableCell>
                      {item.variant?.products?.name}{" "}
                      {item.variant?.variant_name} {item.variant?.color}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {isSerialTrackedVariant(item.variant)
                          ? "Serializado"
                          : "Por cantidad"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.variant_id,
                            "quantity",
                            e.target.value,
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.variant_id,
                            "unit_cost",
                            e.target.value,
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {form.currency === "USD"
                        ? `USD ${(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}`
                        : form.currency === "USDT"
                          ? formatUSDT(
                              Number(item.quantity || 0) *
                                Number(item.unit_cost || 0),
                            )
                          : formatARS(
                              Number(item.quantity || 0) *
                                Number(item.unit_cost || 0),
                            )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveItem(item.variant_id)}
                      >
                        Quitar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items
                  .filter((item) => isSerialTrackedVariant(item.variant))
                  .map((item) => (
                    <TableRow key={`serials-${item.variant_id}`}>
                      <TableCell colSpan={5} className="bg-muted/20">
                        <div className="grid gap-2">
                          <Label>IMEI/SN</Label>
                          <Textarea
                            placeholder={`Carga ${item.quantity || 0} IMEI/SN, uno por linea`}
                            value={item.identifiersText || ""}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.variant_id,
                                "identifiersText",
                                e.target.value,
                              )
                            }
                          />
                          <div className="text-xs text-muted-foreground">
                            Cargados:{" "}
                            {parseIdentifiers(item.identifiersText).length} /{" "}
                            {Number(item.quantity || 0)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Agrega productos a la compra.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-1">
            <Label
              htmlFor="purchase-notes"
              className="text-xs text-muted-foreground"
            >
              Notas
            </Label>
            <Textarea
              id="purchase-notes"
              placeholder="Notas"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">
                Cotizacion
              </Label>
              <Select
                value={form.rate_mode}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    rate_mode: value,
                    manual_fx_rate:
                      value === "manual" ? current.manual_fx_rate : "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cotizacion" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="system">Cotizacion del sistema</SelectItem>
                  <SelectItem value="manual">Cotizacion manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.rate_mode === "manual" && (
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">
                  1 USD/USDT = ? ARS
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Cotizacion manual"
                  value={form.manual_fx_rate}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      manual_fx_rate: e.target.value,
                    }))
                  }
                />
              </div>
            )}
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">
                Total equiv. ARS
              </Label>
              <Input
                value={
                  Number.isFinite(totalAmountArs)
                    ? formatARS(totalAmountArs)
                    : "-"
                }
                readOnly
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Pagos de la compra</h4>
                <p className="text-xs text-muted-foreground">
                  Opcional. Podes agregar pagos ahora o completarlos despues
                  desde el historial.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPayment}
              >
                <IconPlus className="h-4 w-4" />
                Agregar pago
              </Button>
            </div>
            {payments.filter((p) => p.account_id || p.amount).length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                Sin pagos registrados. Se podran agregar despues.
              </div>
            )}
            {payments.map((payment, index) => (
              <div
                key={index}
                className="space-y-3 rounded-md border bg-muted/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={payment.account_id}
                    onValueChange={(value) =>
                      handleUpdatePayment(index, "account_id", value)
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Cuenta..." />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {displayAccounts.length === 0 && (
                        <SelectItem value="none" disabled>
                          Sin cuentas disponibles
                        </SelectItem>
                      )}
                      {displayAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={String(acc.id)}>
                          {acc.name} ({acc.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {payments.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemovePayment(index)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <Input
                    className="flex-1"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Monto (${displayAccounts.find((acc) => String(acc.id) === String(payment.account_id || ""))?.currency || "ARS"})`}
                    value={payment.amount}
                    onChange={(e) =>
                      handleUpdatePayment(index, "amount", e.target.value)
                    }
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Equivale a{" "}
                  {formatARS(
                    convertAmountToARS(
                      payment.amount,
                      displayAccounts.find(
                        (acc) =>
                          String(acc.id) === String(payment.account_id || ""),
                      )?.currency || "ARS",
                      form.rate_mode === "manual"
                        ? resolveManualRate("USD", form.manual_fx_rate)
                        : fxRate,
                      form.rate_mode === "manual"
                        ? resolveManualRate("USDT", form.manual_fx_rate)
                        : usdtRate,
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button onClick={handleSave}>Guardar compra</Button>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Detalle de compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Proveedor:</strong>{" "}
              {detailPurchase?.providers?.name || "-"}
            </div>
            <div>
              <strong>Fecha:</strong> {detailPurchase?.purchase_date || "-"}
            </div>
            <div>
              <strong>Estado:</strong>{" "}
              {detailPurchase?.status === "cancelled"
                ? "Anulada"
                : detailPurchase?.status === "completed"
                  ? "Completada"
                  : "Incompleta"}
            </div>
            <div>
              <strong>Total:</strong>{" "}
              {detailPurchase?.currency === "USD"
                ? formatUSD(detailPurchase?.total_amount)
                : detailPurchase?.currency === "USDT"
                  ? formatUSDT(detailPurchase?.total_amount)
                  : formatARS(detailPurchase?.total_amount)}
            </div>
            {detailPurchase?.void_reason && (
              <div>
                <strong>Motivo:</strong> {detailPurchase.void_reason}
              </div>
            )}
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Costo unit.</TableHead>
                  <TableHead>Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Cargando items...
                    </TableCell>
                  </TableRow>
                )}
                {!detailLoading &&
                  detailItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.product_variants?.products?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {[
                          item.product_variants?.variant_name,
                          item.product_variants?.color,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        {detailPurchase?.currency === "USD"
                          ? formatUSD(item.unit_cost)
                          : detailPurchase?.currency === "USDT"
                            ? formatUSDT(item.unit_cost)
                            : formatARS(item.unit_cost)}
                      </TableCell>
                      <TableCell>
                        {detailPurchase?.currency === "USD"
                          ? formatUSD(item.subtotal)
                          : detailPurchase?.currency === "USDT"
                            ? formatUSDT(item.subtotal)
                            : formatARS(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                {!detailLoading && detailItems.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No hay items registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={completeOpen}
        onOpenChange={(open) => {
          setCompleteOpen(open);
          if (!open) {
            setCompletingPurchase(null);
            setCompleteItems([]);
            setCompletePayments([{ account_id: "", amount: "" }]);
            setCompleteSerialText("");
            setCompleteActiveItem(null);
          }
        }}
      >
        <DialogContent className="w-[90vw] sm:max-w-4xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Completar compra #{completingPurchase?.id}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <div>
                <strong>Proveedor:</strong>{" "}
                {completingPurchase?.providers?.name || "-"}
              </div>
              <div>
                <strong>Fecha:</strong>{" "}
                {completingPurchase?.purchase_date || "-"}
              </div>
              <div>
                <strong>Estado:</strong>{" "}
                {completingPurchase?.status === "completed"
                  ? "Completada"
                  : completingPurchase?.status === "cancelled"
                    ? "Anulada"
                    : "Incompleta"}
              </div>
              <div>
                <strong>Total:</strong>{" "}
                {formatByCurrency(
                  completingPurchase?.currency,
                  completingPurchase?.total_amount,
                )}
              </div>
            </div>

            {completeLoading && (
              <div className="text-center text-sm text-muted-foreground py-4">
                Cargando items...
              </div>
            )}

            {!completeLoading && completingPurchase?.status === "completed" && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-center">
                <div className="text-sm font-medium text-emerald-700">
                  Esta compra esta completa
                </div>
                <div className="text-xs text-emerald-600 mt-1">
                  Todos los pagos y IMEIs fueron registrados.
                </div>
              </div>
            )}

            {!completeLoading && completingPurchase?.status !== "completed" && (
              <>
                {completeRemainingArs > 0.01 && (
                  <div className="space-y-3 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Pagos</h4>
                        <p className="text-xs text-muted-foreground">
                          Pagado: {formatARS(completeTotalPaid)} /{" "}
                          {formatARS(completingPurchase?.total_amount_ars)}
                          {" — Restante: "}
                          <span className="font-medium text-amber-600">
                            {formatARS(completeRemainingArs)}
                          </span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCompletePayments((prev) => [
                            ...prev,
                            { account_id: "", amount: "" },
                          ])
                        }
                      >
                        <IconPlus className="h-4 w-4" />
                        Agregar pago
                      </Button>
                    </div>
                    {completePayments.map((payment, index) => (
                      <div
                        key={index}
                        className="space-y-2 rounded-md border bg-muted/40 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Select
                            value={payment.account_id}
                            onValueChange={(value) =>
                              setCompletePayments((prev) =>
                                prev.map((p, i) =>
                                  i === index ? { ...p, account_id: value } : p,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Cuenta..." />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                              {displayAccounts.length === 0 && (
                                <SelectItem value="none" disabled>
                                  Sin cuentas disponibles
                                </SelectItem>
                              )}
                              {displayAccounts.map((acc) => (
                                <SelectItem key={acc.id} value={String(acc.id)}>
                                  {acc.name} ({acc.currency})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {completePayments.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                setCompletePayments((prev) => {
                                  if (prev.length === 1)
                                    return [{ account_id: "", amount: "" }];
                                  return prev.filter((_, i) => i !== index);
                                })
                              }
                            >
                              <IconTrash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-end gap-2">
                          <Input
                            className="flex-1"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={`Monto (${displayAccounts.find((a) => String(a.id) === String(payment.account_id || ""))?.currency || "ARS"})`}
                            value={payment.amount}
                            onChange={(e) =>
                              setCompletePayments((prev) =>
                                prev.map((p, i) =>
                                  i === index
                                    ? { ...p, amount: e.target.value }
                                    : p,
                                ),
                              )
                            }
                          />
                          {index === completePayments.length - 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!payment.account_id}
                              onClick={() => {
                                const account = displayAccounts.find(
                                  (a) =>
                                    String(a.id) === String(payment.account_id),
                                );
                                const accountCurrency =
                                  account?.currency || "ARS";
                                const rate = getEffectiveRateForCurrency(
                                  accountCurrency,
                                  completingPurchase?.rate_mode || "system",
                                  completingPurchase?.manual_fx_rate,
                                  fxRate,
                                  usdtRate,
                                );
                                if (accountCurrency !== "ARS" && !rate) {
                                  toast.error(
                                    `No hay cotizacion para ${accountCurrency}`,
                                  );
                                  return;
                                }
                                const amount =
                                  accountCurrency === "ARS"
                                    ? completeRemainingArs
                                    : Number(completeRemainingArs || 0) / rate;
                                setCompletePayments((prev) =>
                                  prev.map((p, i) =>
                                    i === index
                                      ? {
                                          ...p,
                                          amount: String(
                                            Number(amount || 0).toFixed(2),
                                          ),
                                        }
                                      : p,
                                  ),
                                );
                              }}
                            >
                              Restante
                            </Button>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Equivale a{" "}
                          {formatARS(
                            convertAmountToARS(
                              payment.amount,
                              displayAccounts.find(
                                (a) =>
                                  String(a.id) ===
                                  String(payment.account_id || ""),
                              )?.currency || "ARS",
                              fxRate,
                              usdtRate,
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                    <Button
                      onClick={handleAddCompletePayment}
                      disabled={completeAddingPayment}
                    >
                      {completeAddingPayment ? "Agregando..." : "Guardar pago"}
                    </Button>
                  </div>
                )}

                {completePendingSerials.length > 0 && (
                  <div className="space-y-3 rounded-md border p-4">
                    <div>
                      <h4 className="text-sm font-medium">IMEIs pendientes</h4>
                      <p className="text-xs text-muted-foreground">
                        {completePendingSerials.length} producto/s con IMEIs por
                        ingresar
                      </p>
                    </div>
                    {completePendingSerials.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-md border p-3 cursor-pointer transition-colors ${
                          completeActiveItem?.id === item.id
                            ? "border-primary bg-primary/5"
                            : "bg-muted/40 hover:bg-muted/60"
                        }`}
                        onClick={() => setCompleteActiveItem(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">
                            {item.product_variants?.products?.name}{" "}
                            {item.product_variants?.variant_name}{" "}
                            {item.product_variants?.color}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.enteredSerials?.length || 0} / {item.quantity}{" "}
                            IMEIs
                          </div>
                        </div>
                      </div>
                    ))}

                    {completeActiveItem && (
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">
                          Agregar IMEIs para{" "}
                          <strong>
                            {
                              completeActiveItem.product_variants?.products
                                ?.name
                            }{" "}
                            {completeActiveItem.product_variants?.variant_name}
                          </strong>
                          {" — Pendientes: "}
                          {completeActiveItem.pendingCount}
                        </div>
                        <Textarea
                          placeholder={`Pega los ${completeActiveItem.pendingCount} IMEIs pendientes, uno por linea`}
                          value={completeSerialText}
                          onChange={(e) =>
                            setCompleteSerialText(e.target.value)
                          }
                          rows={4}
                        />
                        <div className="text-xs text-muted-foreground">
                          Cargados:{" "}
                          {parseIdentifiers(completeSerialText).length} /{" "}
                          {completeActiveItem.pendingCount}
                        </div>
                        <Button
                          onClick={handleAddCompleteSerials}
                          disabled={
                            completeAddingSerials ||
                            parseIdentifiers(completeSerialText).length === 0
                          }
                          size="sm"
                        >
                          {completeAddingSerials
                            ? "Agregando..."
                            : "Guardar IMEIs"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {completeRemainingArs <= 0.01 &&
                  completePendingSerials.length === 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-center">
                      <div className="text-sm font-medium text-emerald-700">
                        Todo completado
                      </div>
                      <div className="text-xs text-emerald-600 mt-1">
                        Todos los pagos e IMEIs fueron registrados.
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) {
            setCancelingPurchase(null);
            setCancelReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Anular compra #{cancelingPurchase?.id}
            </AlertDialogTitle>
            <AlertDialogDescription>
              La compra quedara registrada para auditoria, se revertira el stock
              y se reintegraran los movimientos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancel-purchase-reason">Motivo de anulacion</Label>
            <Textarea
              id="cancel-purchase-reason"
              placeholder="Motivo de anulacion"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelingProcess}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleCancelPurchase();
              }}
              disabled={cancelingProcess}
            >
              {cancelingProcess ? "Anulando..." : "Confirmar anulacion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchasesConfig;
