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
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
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
  usdtRate
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
  const [editOpen, setEditOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelingPurchase, setCancelingPurchase] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelingProcess, setCancelingProcess] = useState(false);
  const [editForm, setEditForm] = useState({
    provider_id: "",
    purchase_date: "",
    currency: "ARS",
    notes: "",
    rate_mode: "system",
    manual_fx_rate: "",
  });
  const [editItems, setEditItems] = useState([]);
  const [editPayments, setEditPayments] = useState([
    { account_id: "", amount: "" },
  ]);
  const [editSearchVariant, setEditSearchVariant] = useState("");
  const [editFocusVariant, setEditFocusVariant] = useState(false);

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
        "id, provider_id, purchase_date, total_amount, currency, total_amount_ars, fx_rate_used, notes, status, void_reason, voided_at, providers(name), purchase_payments(id, account_id, amount, currency, amount_ars, fx_rate_used)"
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
      query = query.gte("purchase_date", dateRange.from.toISOString().slice(0, 10));
    }
    if (dateRange?.to) {
      query = query.lte("purchase_date", dateRange.to.toISOString().slice(0, 10));
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
            "id, variant_name, color, storage, ram, products(name, active, inventory_tracking_mode)"
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
          .select("id, name, currency, is_reference_capital, is_efectivo, is_caja_virtual")
          .eq("is_reference_capital", false)
          .order("name", { ascending: true }),
      ]);

      setProviders(prov || []);
      setVariants((vars || []).filter((variant) => variant.products?.active !== false));
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
    if (isRegisterOpen) return accounts.filter((a) => !a.is_efectivo && !a.is_caja_virtual);
    return accounts;
  }, [accounts, isRegisterOpen]);

  const totalAmount = useMemo(() => {
    return items.reduce(
      (acc, item) => acc + Number(item.quantity || 0) * Number(item.unit_cost || 0),
      0
    );
  }, [items]);

  const totalAmountArs = useMemo(() => {
    const rate = getEffectiveRateForCurrency(
      form.currency,
      form.rate_mode,
      form.manual_fx_rate,
      fxRate,
      usdtRate
    );
    if (form.currency !== "ARS" && !rate) return NaN;
    return form.currency === "ARS" ? totalAmount : totalAmount * rate;
  }, [form.currency, form.manual_fx_rate, form.rate_mode, fxRate, totalAmount, usdtRate]);

  const totalPaid = useMemo(
    () =>
      payments.reduce((acc, payment) => {
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || "")
        );
        const currency = account?.currency || form.currency;
        const amountArs = convertAmountToARS(
          payment.amount,
          currency,
          form.rate_mode === "manual" ? resolveManualRate("USD", form.manual_fx_rate) : fxRate,
          form.rate_mode === "manual" ? resolveManualRate("USDT", form.manual_fx_rate) : usdtRate
        );
        return acc + (Number.isFinite(amountArs) ? amountArs : 0);
      }, 0),
    [displayAccounts, form.currency, form.manual_fx_rate, form.rate_mode, fxRate, payments, usdtRate]
  );

  const remainingArs = useMemo(
    () => Math.max(Number(totalAmountArs || 0) - Number(totalPaid || 0), 0),
    [totalAmountArs, totalPaid]
  );

  const editTotalAmount = useMemo(() => {
    return editItems.reduce(
      (acc, item) => acc + Number(item.quantity || 0) * Number(item.unit_cost || 0),
      0
    );
  }, [editItems]);

  const editTotalAmountArs = useMemo(() => {
    const rate = getEffectiveRateForCurrency(
      editForm.currency,
      editForm.rate_mode,
      editForm.manual_fx_rate,
      fxRate,
      usdtRate
    );
    if (editForm.currency !== "ARS" && !rate) return NaN;
    return editForm.currency === "ARS" ? editTotalAmount : editTotalAmount * rate;
  }, [
    editForm.currency,
    editForm.manual_fx_rate,
    editForm.rate_mode,
    editTotalAmount,
    fxRate,
    usdtRate,
  ]);

  const editTotalPaid = useMemo(
    () =>
      editPayments.reduce((acc, payment) => {
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || "")
        );
        const currency = account?.currency || editForm.currency;
        const amountArs = convertAmountToARS(
          payment.amount,
          currency,
          editForm.rate_mode === "manual"
            ? resolveManualRate("USD", editForm.manual_fx_rate)
            : fxRate,
          editForm.rate_mode === "manual"
            ? resolveManualRate("USDT", editForm.manual_fx_rate)
            : usdtRate
        );
        return acc + (Number.isFinite(amountArs) ? amountArs : 0);
      }, 0),
    [displayAccounts, editForm.currency, editForm.manual_fx_rate, editForm.rate_mode, editPayments, fxRate, usdtRate]
  );

  const editRemainingArs = useMemo(
    () => Math.max(Number(editTotalAmountArs || 0) - Number(editTotalPaid || 0), 0),
    [editTotalAmountArs, editTotalPaid]
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
      prev.map((i) =>
        i.variant_id === id ? { ...i, [field]: value } : i
      )
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
        paymentIndex === index ? { ...payment, [field]: value } : payment
      )
    );
  };

  const fillRemainingPayment = (index) => {
    const payment = payments[index];
    if (!payment?.account_id) return;

    const account = displayAccounts.find(
      (item) => String(item.id) === String(payment.account_id || "")
    );
    const accountCurrency = account?.currency || "ARS";
    const rate = getEffectiveRateForCurrency(
      accountCurrency,
      form.rate_mode,
      form.manual_fx_rate,
      fxRate,
      usdtRate
    );

    if (accountCurrency !== "ARS" && !rate) {
      toast.error(`No hay cotizacion disponible para ${accountCurrency}`);
      return;
    }

    const amount =
      accountCurrency === "ARS" ? remainingArs : Number(remainingArs || 0) / rate;

    handleUpdatePayment(index, "amount", String(Number(amount || 0).toFixed(2)));
  };

  const handleRemovePayment = (index) => {
    setPayments((current) => {
      if (current.length === 1) return [{ account_id: "", amount: "" }];
      return current.filter((_, paymentIndex) => paymentIndex !== index);
    });
  };

  const handleAddEditItem = (variant) => {
    if (isSerialTrackedVariant(variant)) {
      toast.error(
        "Los productos serializados todavia no se pueden agregar desde la edicion de compras"
      );
      return;
    }
    if (editItems.some((item) => item.variant_id === variant.id)) return;
    setEditItems((prev) => [
      ...prev,
      {
        variant_id: variant.id,
        variant,
        quantity: 1,
        unit_cost: "",
        identifiersText: "",
      },
    ]);
    setEditSearchVariant("");
  };

  const handleUpdateEditItem = (id, field, value) => {
    setEditItems((prev) =>
      prev.map((item) =>
        item.variant_id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleRemoveEditItem = (id) => {
    setEditItems((prev) => prev.filter((item) => item.variant_id !== id));
  };

  const handleAddEditPayment = () => {
    setEditPayments((current) => [...current, { account_id: "", amount: "" }]);
  };

  const handleUpdateEditPayment = (index, field, value) => {
    setEditPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, [field]: value } : payment
      )
    );
  };

  const fillEditRemainingPayment = (index) => {
    const payment = editPayments[index];
    if (!payment?.account_id) return;

    const account = displayAccounts.find(
      (item) => String(item.id) === String(payment.account_id || "")
    );
    const accountCurrency = account?.currency || "ARS";
    const rate = getEffectiveRateForCurrency(
      accountCurrency,
      editForm.rate_mode,
      editForm.manual_fx_rate,
      fxRate,
      usdtRate
    );

    if (accountCurrency !== "ARS" && !rate) {
      toast.error(`No hay cotizacion disponible para ${accountCurrency}`);
      return;
    }

    const amount =
      accountCurrency === "ARS" ? editRemainingArs : Number(editRemainingArs || 0) / rate;

    handleUpdateEditPayment(index, "amount", String(Number(amount || 0).toFixed(2)));
  };

  const handleRemoveEditPayment = (index) => {
    setEditPayments((current) => {
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
          Number(item.quantity || 0) <= 0 || Number(item.unit_cost || 0) < 0
      )
    ) {
      return toast.error("Completa cantidades y costos validos para todos los items");
    }
    if (
      payments.some(
        (payment) => !payment.account_id || Number(payment.amount || 0) <= 0
      )
    ) {
      return toast.error("Completa todas las cuentas y montos del pago");
    }
    if (
      payments.some((payment) => {
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || "")
        );
        if (!account) return true;
        if (
          account.currency !== "ARS" &&
          !getEffectiveRateForCurrency(
            account.currency,
            form.rate_mode,
            form.manual_fx_rate,
            fxRate,
            usdtRate
          )
        ) {
          return true;
        }
        return false;
      })
    ) {
      return toast.error(
        "Falta cotizacion activa para alguna de las cuentas elegidas"
      );
    }
    if (Math.abs(totalPaid - totalAmountArs) > 0.01) {
      return toast.error(
        "La suma de los pagos debe coincidir con el total de la compra"
      );
    }

    const currency = form.currency;
    const rate = getEffectiveRateForCurrency(
      currency,
      form.rate_mode,
      form.manual_fx_rate,
      fxRate,
      usdtRate
    );
    if (currency !== "ARS" && !rate) {
      return toast.error(`No hay cotizacion activa para ${currency}`);
    }

    const duplicateIdentifiers = new Set();
    for (const item of items) {
      if (!isSerialTrackedVariant(item.variant)) continue;
      const identifiers = parseIdentifiers(item.identifiersText);
      const expected = Number(item.quantity || 0);
      if (identifiers.length !== expected) {
        return toast.error(
          `${item.variant?.products?.name || "La variante"} requiere ${expected} IMEI/SN y cargaste ${identifiers.length}`
        );
      }
      for (const identifier of identifiers) {
        const normalized = normalizeIdentifier(identifier);
        if (!normalized) {
          return toast.error("Todos los IMEI/SN deben estar completos");
        }
        if (duplicateIdentifiers.has(normalized)) {
          return toast.error(
            `El IMEI/SN ${identifier} esta repetido en la compra`
          );
        }
        duplicateIdentifiers.add(normalized);
      }
    }

    const paymentRows = payments.map((payment) => {
      const account = displayAccounts.find(
        (item) => String(item.id) === String(payment.account_id || "")
      );
      const paymentAmount = Number(payment.amount || 0);
      const paymentCurrency = account?.currency || currency;
      const paymentRate = getEffectiveRateForCurrency(
        paymentCurrency,
        form.rate_mode,
        form.manual_fx_rate,
        fxRate,
        usdtRate
      );
      return {
        account_id: Number(payment.account_id),
        payment_method_id: null,
        amount: paymentAmount,
        currency: paymentCurrency,
        amount_ars:
          paymentCurrency === "ARS" ? paymentAmount : paymentAmount * paymentRate,
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

    const { error } = await supabase.rpc("create_purchase_with_inventory_units", {
      p_provider_id: Number(form.provider_id),
      p_purchase_date: form.purchase_date,
      p_currency: currency,
      p_total_amount: totalAmount,
      p_total_amount_ars: totalAmountArs,
      p_fx_rate_used: currency === "ARS" ? null : rate,
      p_notes: form.notes || null,
      p_items: payloadItems,
      p_payments: paymentRows,
    });

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
        "id, quantity, unit_cost, subtotal, product_variants(variant_name, color, storage, ram, products(name, inventory_tracking_mode))"
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

  const openPurchaseEdit = async (purchase) => {
    if (!purchase?.id) return;
    if (purchase.status === "cancelled") {
      toast.error("No se puede editar una compra anulada");
      return;
    }

    const [{ data: purchaseData, error: purchaseError }, { data: itemsData, error: itemsError }] =
      await Promise.all([
        supabase
          .from("purchases")
          .select(
            "id, provider_id, purchase_date, currency, total_amount, notes, status, void_reason, voided_at, purchase_payments(id, account_id, amount, currency, amount_ars, fx_rate_used)"
          )
          .eq("id", purchase.id)
          .single(),
        supabase
          .from("purchase_items")
          .select(
            "id, variant_id, quantity, unit_cost, subtotal, product_variants(id, variant_name, color, storage, ram, products(name, inventory_tracking_mode))"
          )
          .eq("purchase_id", purchase.id)
          .order("id", { ascending: true }),
      ]);

    if (purchaseError) {
      toast.error("No se pudo cargar la compra", {
        description: purchaseError.message,
      });
      return;
    }

    if (itemsError) {
      toast.error("No se pudieron cargar los items de la compra", {
        description: itemsError.message,
      });
      return;
    }

    if ((itemsData || []).some((item) => isSerialTrackedVariant(item.product_variants))) {
      toast.error(
        "Las compras con productos serializados todavia no se pueden editar desde este formulario"
      );
      return;
    }

    setEditingPurchase(purchaseData);
    setEditForm({
      provider_id: String(purchaseData.provider_id || ""),
      purchase_date: purchaseData.purchase_date || "",
      currency: purchaseData.currency || "ARS",
      notes: purchaseData.notes || "",
      rate_mode: "system",
      manual_fx_rate: "",
    });
    setEditItems(
      (itemsData || []).map((item) => ({
        variant_id: item.variant_id,
        variant: item.product_variants,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        identifiersText: "",
      }))
    );
    setEditPayments(
      purchaseData.purchase_payments?.length
        ? purchaseData.purchase_payments.map((paymentItem) => ({
            account_id: paymentItem.account_id ? String(paymentItem.account_id) : "",
            amount: String(paymentItem.amount ?? ""),
          }))
        : [{ account_id: "", amount: "" }]
    );
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPurchase?.id) return;
    if (editingPurchase.status === "cancelled") {
      return toast.error("No se puede editar una compra anulada");
    }
    if (editItems.some((item) => isSerialTrackedVariant(item.variant))) {
      return toast.error(
        "Las compras con productos serializados todavia no se pueden editar"
      );
    }
    if (!editForm.provider_id) return toast.error("Selecciona un proveedor");
    if (!editItems.length) return toast.error("Agrega al menos un producto");
    if (
      editPayments.some(
        (payment) => !payment.account_id || Number(payment.amount || 0) <= 0
      )
    ) {
      return toast.error("Completa todas las cuentas y montos del pago");
    }
    if (
      editPayments.some((payment) => {
        const account = displayAccounts.find(
          (item) => String(item.id) === String(payment.account_id || "")
        );
        if (!account) return true;
        if (
          account.currency !== "ARS" &&
          !getEffectiveRateForCurrency(
            account.currency,
            editForm.rate_mode,
            editForm.manual_fx_rate,
            fxRate,
            usdtRate
          )
        ) {
          return true;
        }
        return false;
      })
    ) {
      return toast.error("Falta cotizacion activa para alguna de las cuentas elegidas");
    }
    if (Math.abs(editTotalPaid - editTotalAmountArs) > 0.01) {
      return toast.error("La suma de los pagos debe coincidir con el total de la compra");
    }

    const currency = editForm.currency;
    const rate = getEffectiveRateForCurrency(
      currency,
      editForm.rate_mode,
      editForm.manual_fx_rate,
      fxRate,
      usdtRate
    );
    if (currency !== "ARS" && !rate) {
      return toast.error(`No hay cotizacion activa para ${currency}`);
    }

    const { error: purchaseError } = await supabase
      .from("purchases")
      .update({
        provider_id: Number(editForm.provider_id),
        purchase_date: editForm.purchase_date,
        currency,
        total_amount: editTotalAmount,
        total_amount_ars: totalAmountArs,
        fx_rate_used: currency === "ARS" ? null : rate,
        notes: editForm.notes || null,
      })
      .eq("id", editingPurchase.id);

    if (purchaseError) {
      toast.error("No se pudo actualizar la compra", {
        description: purchaseError.message,
      });
      return;
    }

    const { error: deletePaymentsError } = await supabase
      .from("purchase_payments")
      .delete()
      .eq("purchase_id", editingPurchase.id);

    if (deletePaymentsError) {
      toast.error("No se pudieron actualizar los pagos de la compra", {
        description: deletePaymentsError.message,
      });
      return;
    }

    const editPaymentRows = editPayments.map((payment) => {
      const account = displayAccounts.find(
        (item) => String(item.id) === String(payment.account_id || "")
      );
      const paymentAmount = Number(payment.amount || 0);
      const paymentCurrency = account?.currency || currency;
      const paymentRate = getEffectiveRateForCurrency(
        paymentCurrency,
        editForm.rate_mode,
        editForm.manual_fx_rate,
        fxRate,
        usdtRate
      );
      return {
        purchase_id: editingPurchase.id,
        account_id: Number(payment.account_id),
        amount: paymentAmount,
        currency: paymentCurrency,
        amount_ars:
          paymentCurrency === "ARS" ? paymentAmount : paymentAmount * paymentRate,
        fx_rate_used: paymentCurrency === "ARS" ? null : paymentRate,
        notes: editForm.notes || null,
      };
    });

    const { error: paymentInsertError } = await supabase
      .from("purchase_payments")
      .insert(editPaymentRows);

    if (paymentInsertError) {
      toast.error("No se pudo registrar el pago de la compra", {
        description: paymentInsertError.message,
      });
      return;
    }

    const { error: deleteItemsError } = await supabase
      .from("purchase_items")
      .delete()
      .eq("purchase_id", editingPurchase.id);

    if (deleteItemsError) {
      toast.error("No se pudieron actualizar los items", {
        description: deleteItemsError.message,
      });
      return;
    }

    const payloadItems = editItems.map((item) => ({
      purchase_id: editingPurchase.id,
      variant_id: item.variant_id,
      quantity: Number(item.quantity || 0),
      unit_cost: Number(item.unit_cost || 0),
      subtotal: Number(item.quantity || 0) * Number(item.unit_cost || 0),
    }));

    const { error: insertItemsError } = await supabase
      .from("purchase_items")
      .insert(payloadItems);

    if (insertItemsError) {
      toast.error("No se pudieron guardar los nuevos items", {
        description: insertItemsError.message,
      });
      return;
    }

    toast.success("Compra actualizada");
    setEditOpen(false);
    setEditingPurchase(null);
    setEditItems([]);
    setEditSearchVariant("");
    setEditPayments([{ account_id: "", amount: "" }]);
    await loadPurchases();
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

  const getPurchaseStatusBadge = (status) => {
    if (status === "cancelled") {
      return (
        <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
          ANULADA
        </Badge>
      );
    }
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        ACTIVA
      </Badge>
    );
  };

  if (!isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  const filteredVariants = variants.filter((v) => {
    const name = `${v.products?.name || ""} ${v.variant_name || ""} ${v.color || ""}`
      .toLowerCase()
      .trim();
    return name.includes(searchVariant.toLowerCase());
  });

  const filteredEditVariants = variants.filter((variant) => {
    const name = `${variant.products?.name || ""} ${variant.variant_name || ""} ${variant.color || ""}`
      .toLowerCase()
      .trim();
    return name.includes(editSearchVariant.toLowerCase());
  });

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Registrar compra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="grid gap-1">
                <Label htmlFor="purchase-date" className="text-xs text-muted-foreground">
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
                <Label htmlFor="purchase-provider" className="text-xs text-muted-foreground">
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
                <Label htmlFor="purchase-currency" className="text-xs text-muted-foreground">
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
                <Label htmlFor="purchase-total" className="text-xs text-muted-foreground">
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
                <Label htmlFor="purchase-paid" className="text-xs text-muted-foreground">
                  Pagado equiv. ARS
                </Label>
                <Input
                  id="purchase-paid"
                  value={formatARS(totalPaid)}
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
                      {item.variant?.products?.name} {item.variant?.variant_name}{" "}
                      {item.variant?.color}
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
                          handleUpdateItem(item.variant_id, "quantity", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) =>
                          handleUpdateItem(item.variant_id, "unit_cost", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {form.currency === "USD"
                        ? `USD ${(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}`
                        : form.currency === "USDT"
                          ? formatUSDT(
                              Number(item.quantity || 0) *
                                Number(item.unit_cost || 0)
                            )
                        : formatARS(Number(item.quantity || 0) * Number(item.unit_cost || 0))}
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
                                e.target.value
                              )
                            }
                          />
                          <div className="text-xs text-muted-foreground">
                            Cargados: {parseIdentifiers(item.identifiersText).length} /{" "}
                            {Number(item.quantity || 0)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Agrega productos a la compra.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-1">
            <Label htmlFor="purchase-notes" className="text-xs text-muted-foreground">
              Notas
            </Label>
            <Textarea
              id="purchase-notes"
              placeholder="Notas"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Cotizacion</Label>
              <Select
                value={form.rate_mode}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    rate_mode: value,
                    manual_fx_rate: value === "manual" ? current.manual_fx_rate : "",
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
              <Label className="text-xs text-muted-foreground">Total equiv. ARS</Label>
              <Input value={Number.isFinite(totalAmountArs) ? formatARS(totalAmountArs) : "-"} readOnly />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Pagos de la compra</h4>
                <p className="text-xs text-muted-foreground">
                  Distribui el total entre una o mas cuentas, como en ventas.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddPayment}>
                <IconPlus className="h-4 w-4" />
                Agregar pago
              </Button>
            </div>
            {payments.map((payment, index) => (
              <div key={index} className="space-y-3 rounded-md border bg-muted/40 p-3">
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
                  {index === payments.length - 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!payment.account_id}
                      onClick={() => fillRemainingPayment(index)}
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
                        (acc) => String(acc.id) === String(payment.account_id || "")
                      )?.currency || "ARS",
                      form.rate_mode === "manual"
                        ? resolveManualRate("USD", form.manual_fx_rate)
                        : fxRate,
                      form.rate_mode === "manual"
                        ? resolveManualRate("USDT", form.manual_fx_rate)
                        : usdtRate
                    )
                  )}
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground">
              Diferencia equiv. ARS: {formatARS(totalAmountArs - totalPaid)}
            </div>
          </div>

          <Button onClick={handleSave}>Guardar compra</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compras</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Fecha</span>
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
                <span className="text-xs text-muted-foreground">Semana</span>
                <Button variant="outline" onClick={handleWeekFilter}>
                  Semana actual
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 md:justify-end">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Proveedor</span>
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
                    <SelectItem value="all">Todos</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Moneda</span>
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
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Actualizar</span>
                <Button onClick={loadPurchases} disabled={loading}>
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
                                openPurchaseEdit(p);
                              }}
                            >
                              <IconEdit className="mr-2 h-4 w-4" />
                              Editar
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
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay compras registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Detalle de compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div><strong>Proveedor:</strong> {detailPurchase?.providers?.name || "-"}</div>
            <div><strong>Fecha:</strong> {detailPurchase?.purchase_date || "-"}</div>
            <div><strong>Estado:</strong> {detailPurchase?.status === "cancelled" ? "Anulada" : "Activa"}</div>
            <div>
              <strong>Total:</strong>{" "}
              {detailPurchase?.currency === "USD"
                ? formatUSD(detailPurchase?.total_amount)
                : detailPurchase?.currency === "USDT"
                  ? formatUSDT(detailPurchase?.total_amount)
                : formatARS(detailPurchase?.total_amount)}
            </div>
            {detailPurchase?.void_reason && (
              <div><strong>Motivo:</strong> {detailPurchase.void_reason}</div>
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
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Cargando items...
                    </TableCell>
                  </TableRow>
                )}
                {!detailLoading &&
                  detailItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_variants?.products?.name || "-"}</TableCell>
                      <TableCell>
                        {[item.product_variants?.variant_name, item.product_variants?.color]
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
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
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
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingPurchase(null);
            setEditItems([]);
            setEditSearchVariant("");
          }
        }}
      >
        <DialogContent className="w-[90vw] sm:max-w-4xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Editar compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-1">
                <Label htmlFor="edit-purchase-date" className="text-xs text-muted-foreground">
                  Fecha
                </Label>
                <Input
                  id="edit-purchase-date"
                  type="date"
                  value={editForm.purchase_date}
                  onChange={(e) =>
                    setEditForm((current) => ({
                      ...current,
                      purchase_date: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-purchase-provider" className="text-xs text-muted-foreground">
                  Proveedor
                </Label>
                <Select
                  value={editForm.provider_id}
                  onValueChange={(value) =>
                    setEditForm((current) => ({ ...current, provider_id: value }))
                  }
                >
                  <SelectTrigger id="edit-purchase-provider">
                    <SelectValue placeholder="Proveedor" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-purchase-currency" className="text-xs text-muted-foreground">
                  Moneda
                </Label>
                <Select
                  value={editForm.currency}
                  onValueChange={(value) =>
                    setEditForm((current) => ({ ...current, currency: value }))
                  }
                >
                  <SelectTrigger id="edit-purchase-currency">
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
                <Label htmlFor="edit-purchase-total" className="text-xs text-muted-foreground">
                  Total
                </Label>
                <Input
                  id="edit-purchase-total"
                  readOnly
                  value={formatByCurrency(editForm.currency, editTotalAmount)}
                />
              </div>
            </div>

            <div className="relative">
              <Input
                placeholder="Buscar producto/variante..."
                value={editSearchVariant}
                onFocus={() => setEditFocusVariant(true)}
                onBlur={() => setTimeout(() => setEditFocusVariant(false), 200)}
                onChange={(e) => setEditSearchVariant(e.target.value)}
              />
              {editFocusVariant && editSearchVariant && (
                <div className="absolute z-[50] mt-1 w-full rounded-md border bg-background shadow">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredEditVariants.length > 0 ? (
                      filteredEditVariants.slice(0, 40).map((variant) => (
                        <button
                          type="button"
                          key={variant.id}
                          onClick={() => handleAddEditItem(variant)}
                          className="w-full text-left px-3 py-2 hover:bg-muted"
                        >
                          {variant.products?.name} {variant.variant_name} {variant.color}
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
                  {editItems.map((item) => (
                    <TableRow key={item.variant_id}>
                      <TableCell>
                        {item.variant?.products?.name} {item.variant?.variant_name}{" "}
                        {item.variant?.color}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateEditItem(
                              item.variant_id,
                              "quantity",
                              e.target.value
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
                            handleUpdateEditItem(
                              item.variant_id,
                              "unit_cost",
                              e.target.value
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {editForm.currency === "USD"
                          ? `USD ${(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}`
                          : editForm.currency === "USDT"
                            ? formatUSDT(
                                Number(item.quantity || 0) * Number(item.unit_cost || 0)
                              )
                            : formatARS(
                                Number(item.quantity || 0) * Number(item.unit_cost || 0)
                              )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveEditItem(item.variant_id)}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {editItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Agrega productos a la compra.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Pagos de la compra</h4>
                  <p className="text-xs text-muted-foreground">
                    Distribui el total entre una o mas cuentas.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddEditPayment}
                >
                  <IconPlus className="h-4 w-4" />
                  Agregar pago
                </Button>
              </div>
              {editPayments.map((payment, index) => (
                <div key={index} className="space-y-3 rounded-md border bg-muted/40 p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={payment.account_id}
                      onValueChange={(value) =>
                        handleUpdateEditPayment(index, "account_id", value)
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
                        {displayAccounts.map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            {account.name} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editPayments.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => handleRemoveEditPayment(index)}
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
                        handleUpdateEditPayment(index, "amount", e.target.value)
                      }
                    />
                    {index === editPayments.length - 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!payment.account_id}
                        onClick={() => fillEditRemainingPayment(index)}
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
                          (acc) => String(acc.id) === String(payment.account_id || "")
                        )?.currency || "ARS",
                        editForm.rate_mode === "manual"
                          ? resolveManualRate("USD", editForm.manual_fx_rate)
                          : fxRate,
                        editForm.rate_mode === "manual"
                          ? resolveManualRate("USDT", editForm.manual_fx_rate)
                          : usdtRate
                      )
                    )}
                  </div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                Diferencia equiv. ARS: {formatARS(editTotalAmountArs - editTotalPaid)}
              </div>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="edit-purchase-notes" className="text-xs text-muted-foreground">
                Notas
              </Label>
              <Textarea
                id="edit-purchase-notes"
                placeholder="Notas"
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((current) => ({ ...current, notes: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Cotizacion</Label>
                <Select
                  value={editForm.rate_mode}
                  onValueChange={(value) =>
                    setEditForm((current) => ({
                      ...current,
                      rate_mode: value,
                      manual_fx_rate: value === "manual" ? current.manual_fx_rate : "",
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
              {editForm.rate_mode === "manual" && (
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    1 USD/USDT = ? ARS
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Cotizacion manual"
                    value={editForm.manual_fx_rate}
                    onChange={(e) =>
                      setEditForm((current) => ({
                        ...current,
                        manual_fx_rate: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Total equiv. ARS</Label>
                <Input
                  value={
                    Number.isFinite(editTotalAmountArs) ? formatARS(editTotalAmountArs) : "-"
                  }
                  readOnly
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Guardar cambios</Button>
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
              La compra quedara registrada para auditoria, se revertira el stock y se reintegraran
              los movimientos asociados.
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
            <AlertDialogCancel disabled={cancelingProcess}>Cancelar</AlertDialogCancel>
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


