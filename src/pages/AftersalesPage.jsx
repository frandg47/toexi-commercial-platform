import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContextProvider";
import { formatPersonName } from "@/utils/formatName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconDotsVertical,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconTool,
} from "@tabler/icons-react";
import { toast } from "sonner";

const ARS_TOLERANCE = 10;

const STATUS_LABELS = {
  defective_in_store: "Defectuoso en local",
  in_repair: "En reparacion",
  repaired: "Reparado",
};

const STATUS_BADGE = {
  defective_in_store:
    "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  in_repair:
    "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  repaired:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
};

const SOURCE_LABELS = {
  factory: "Fabrica",
  warranty: "Garantia",
};

const formatVariantLabel = (variant) => {
  if (!variant) return "-";
  return [
    variant.products?.name,
    variant.variant_name,
    variant.color && `(${variant.color})`,
  ]
    .filter(Boolean)
    .join(" ");
};

const normalizeIdentifier = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isSerialTrackedVariant = (variant) =>
  variant?.products?.inventory_tracking_mode === "serial";

const formatARS = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatUSD = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const getPaymentDisplayCurrency = (methodName) => {
  const upper = methodName?.toUpperCase();
  if (upper === "USDT") return "USDT";
  if (upper === "USD") return "USD";
  return "ARS";
};

const isUsdMethod = (methodName) =>
  ["USD", "USDT"].includes(methodName?.toUpperCase());

export default function AftersalesPage() {
  const { role } = useAuth();
  const isAllowed = ["owner", "superadmin"].includes(
    `${role || ""}`.toLowerCase(),
  );

  const [devices, setDevices] = useState([]);
  const [variants, setVariants] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentInstallments, setPaymentInstallments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [salesChannels, setSalesChannels] = useState([]);
  const [fxRate, setFxRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [sellingDevice, setSellingDevice] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    source: "all",
  });
  const [form, setForm] = useState({
    variant_id: "",
    quantity: "1",
    imei: "",
    notes: "",
    include_in_stock_cost_balance: false,
  });
  const [saleForm, setSaleForm] = useState({
    customer_id: "",
    seller_id: "",
    channel_id: "",
    unit_price_usd: "",
    notes: "",
    payments: [
      {
        payment_method_id: "",
        method_name: "",
        amount: "",
        installments: "",
        account_id: "",
        reference: "",
        multiplier: 1,
      },
    ],
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: devicesData, error: devicesError },
        { data: variantsData, error: variantsError },
      ] = await Promise.all([
        supabase
          .from("aftersales_devices")
          .select(
            "id, sale_id, warranty_exchange_id, source_type, imei, quantity, status, notes, include_in_stock_cost_balance, sold_sale_id, sold_at, created_at, updated_at, variant:product_variants!aftersales_devices_variant_id_fkey(id, variant_name, color, cost_price_usd, products(name)), warranty:warranty_exchanges!aftersales_devices_warranty_exchange_id_fkey(id, reason)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("product_variants")
          .select(
            "id, variant_name, color, stock, products(name, active, inventory_tracking_mode)",
          )
          .gt("stock", 0)
          .order("id", { ascending: false }),
      ]);

      if (devicesError) throw devicesError;
      if (variantsError) throw variantsError;

      setDevices(devicesData || []);
      setVariants(
        (variantsData || []).filter(
          (variant) => variant.products?.active !== false,
        ),
      );
    } catch (error) {
      toast.error("No se pudo cargar postventa", {
        description: error?.message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    load();
  }, [isAllowed, load]);

  useEffect(() => {
    if (!isAllowed) return;

    const fetchHelpers = async () => {
      const [
        { data: customersData },
        { data: sellersData },
        { data: paymentMethodsData },
        { data: installmentsData },
        { data: accountsData },
        { data: channelsData },
        { data: fxRatesData },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, last_name, phone, email")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(200),
        supabase
          .from("users")
          .select("id_auth, name, last_name, phone, email")
          .eq("role", "seller")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("payment_methods")
          .select("id, name, multiplier")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("payment_installments")
          .select("id, payment_method_id, installments, multiplier")
          .order("installments", { ascending: true }),
        supabase
          .from("accounts")
          .select(
            "id, name, currency, is_reference_capital, is_efectivo, is_caja_virtual",
          )
          .eq("is_reference_capital", false)
          .order("name", { ascending: true }),
        supabase
          .from("sales_channels")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("fx_rates")
          .select("source, rate")
          .eq("is_active", true)
          .in("source", ["blue", "USDT"]),
      ]);

      setCustomers(customersData || []);
      setSellers(sellersData || []);
      setPaymentMethods(paymentMethodsData || []);
      setPaymentInstallments(installmentsData || []);
      setAccounts(accountsData || []);
      setSalesChannels(channelsData || []);

      const blueRate = (fxRatesData || []).find(
        (rate) => rate.source?.toLowerCase() === "blue",
      );
      const currentUsdtRate = (fxRatesData || []).find(
        (rate) => rate.source?.toUpperCase() === "USDT",
      );
      setFxRate(blueRate?.rate ? Number(blueRate.rate) : null);
      setUsdtRate(currentUsdtRate?.rate ? Number(currentUsdtRate.rate) : null);
    };

    fetchHelpers();
  }, [isAllowed]);

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

  const filteredDevices = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return devices.filter((device) => {
      if (filters.status !== "all" && device.status !== filters.status)
        return false;
      if (filters.source !== "all" && device.source_type !== filters.source)
        return false;
      if (!search) return true;

      return [
        formatVariantLabel(device.variant),
        device.imei,
        device.notes,
        device.warranty?.reason,
        device.sale_id ? `venta ${device.sale_id}` : "",
        device.sold_sale_id ? `vendida ${device.sold_sale_id}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [devices, filters]);

  const summary = useMemo(
    () =>
      devices.reduce(
        (acc, device) => {
          if (device.sold_sale_id != null) return acc;
          acc.total += Number(device.quantity || 0);
          acc[device.status] += Number(device.quantity || 0);
          return acc;
        },
        { total: 0, defective_in_store: 0, in_repair: 0, repaired: 0 },
      ),
    [devices],
  );

  const selectedCustomer = useMemo(
    () =>
      customers.find(
        (customer) => String(customer.id) === String(saleForm.customer_id),
      ) || null,
    [customers, saleForm.customer_id],
  );
  const selectedAftersalesVariant = useMemo(
    () =>
      variants.find(
        (variant) => String(variant.id) === String(form.variant_id),
      ) || null,
    [form.variant_id, variants],
  );

  const selectedSeller = useMemo(
    () =>
      sellers.find(
        (seller) => String(seller.id_auth) === String(saleForm.seller_id),
      ) || null,
    [saleForm.seller_id, sellers],
  );

  const getInstallmentsForMethod = useCallback(
    (methodId) =>
      paymentInstallments.filter(
        (inst) => inst.payment_method_id === Number(methodId),
      ),
    [paymentInstallments],
  );

  const getPaymentFxRate = useCallback(
    (methodName) => {
      const upper = methodName?.toUpperCase();
      if (upper === "USDT") return usdtRate;
      if (upper === "USD") return fxRate;
      return 1;
    },
    [fxRate, usdtRate],
  );

  const saleQuantity = Number(sellingDevice?.quantity || 0);
  const saleBaseTotalArs = useMemo(() => {
    if (!fxRate) return 0;
    return Number(saleForm.unit_price_usd || 0) * saleQuantity * Number(fxRate);
  }, [fxRate, saleForm.unit_price_usd, saleQuantity]);

  const salePaidNoInterest = useMemo(
    () =>
      saleForm.payments
        .filter((payment) => Number(payment.multiplier || 1) === 1)
        .reduce((acc, payment) => {
          const amount = Number(payment.amount || 0);
          if (isUsdMethod(payment.method_name)) {
            const rate = getPaymentFxRate(payment.method_name);
            return rate ? acc + amount * rate : acc;
          }
          return acc + amount;
        }, 0),
    [getPaymentFxRate, saleForm.payments],
  );

  const saleInterestMethod = useMemo(
    () =>
      saleForm.payments.find(
        (payment) => Number(payment.multiplier || 1) > 1,
      ) || null,
    [saleForm.payments],
  );

  const saleSaldo = useMemo(
    () => Math.max(saleBaseTotalArs - salePaidNoInterest, 0),
    [saleBaseTotalArs, salePaidNoInterest],
  );

  const saleTotalDueArs = useMemo(() => {
    if (!saleInterestMethod) return saleBaseTotalArs;
    return (
      saleBaseTotalArs +
      saleSaldo * (Number(saleInterestMethod.multiplier || 1) - 1)
    );
  }, [saleBaseTotalArs, saleInterestMethod, saleSaldo]);

  const salePaidArs = useMemo(
    () =>
      saleForm.payments.reduce((acc, payment) => {
        const amount = Number(payment.amount || 0);
        if (isUsdMethod(payment.method_name)) {
          const rate = getPaymentFxRate(payment.method_name);
          return rate ? acc + amount * rate : acc;
        }
        return acc + amount;
      }, 0),
    [getPaymentFxRate, saleForm.payments],
  );

  const saleRemaining = useMemo(
    () => Math.max(saleTotalDueArs - salePaidArs, 0),
    [salePaidArs, saleTotalDueArs],
  );

  const resetForm = () => {
    setForm({
      variant_id: "",
      quantity: "1",
      imei: "",
      notes: "",
      include_in_stock_cost_balance: false,
    });
  };

  const resetSaleForm = useCallback(() => {
    const localChannel = salesChannels.find(
      (channel) => channel.name === "Local",
    );
    setSellingDevice(null);
    setSaleForm({
      customer_id: "",
      seller_id: "",
      channel_id: localChannel ? String(localChannel.id) : "",
      unit_price_usd: "",
      notes: "",
      payments: [
        {
          payment_method_id: "",
          method_name: "",
          amount: "",
          installments: "",
          account_id: "",
          reference: "",
          multiplier: 1,
        },
      ],
    });
  }, [salesChannels]);

  const handleRegister = async () => {
    if (!form.variant_id) return toast.error("Selecciona una variante");

    const selectedVariant = variants.find(
      (variant) => String(variant.id) === String(form.variant_id),
    );

    let inventoryUnitId = null;
    if (isSerialTrackedVariant(selectedVariant)) {
      if (Number(form.quantity || 0) !== 1) {
        return toast.error(
          "Los productos serializados deben enviarse de a una unidad",
        );
      }

      const normalizedIdentifier = normalizeIdentifier(form.imei);
      if (!normalizedIdentifier) {
        return toast.error("Debes indicar el IMEI/SN del equipo serializado");
      }

      const { data: inventoryUnits, error: inventoryError } = await supabase
        .from("inventory_units")
        .select("id")
        .eq("variant_id", Number(form.variant_id))
        .eq("identifier_normalized", normalizedIdentifier)
        .eq("status", "available")
        .limit(1);

      if (inventoryError) {
        return toast.error("No se pudo validar la unidad serializada", {
          description: inventoryError.message,
        });
      }

      inventoryUnitId = inventoryUnits?.[0]?.id || null;
      if (!inventoryUnitId) {
        return toast.error(
          "No se encontró una unidad disponible con ese IMEI/SN",
        );
      }
    }

    try {
      setSubmitting(true);
      const { error } = await supabase.rpc("register_aftersales_device", {
        p_variant_id: Number(form.variant_id),
        p_quantity: Number(form.quantity || 0),
        p_imei: form.imei.trim() || null,
        p_notes: form.notes.trim() || null,
        p_include_in_stock_cost_balance:
          form.include_in_stock_cost_balance || false,
        p_inventory_unit_id: inventoryUnitId,
      });
      if (error) throw error;
      toast.success("Equipo enviado a postventa");
      setDialogOpen(false);
      resetForm();
      load();
    } catch (error) {
      toast.error("No se pudo registrar el equipo", {
        description: error?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (device, nextStatus) => {
    try {
      const { error } = await supabase.rpc("update_aftersales_device_status", {
        p_aftersales_device_id: device.id,
        p_status: nextStatus,
        p_notes: device.notes || null,
      });
      if (error) throw error;
      toast.success("Estado actualizado");
      load();
    } catch (error) {
      toast.error("No se pudo actualizar el estado", {
        description: error?.message,
      });
    }
  };

  const handleBalanceInclusionChange = async (device, include) => {
    try {
      const { error } = await supabase.rpc(
        "set_aftersales_stock_cost_balance",
        {
          p_aftersales_device_id: device.id,
          p_include: include,
        },
      );
      if (error) throw error;
      toast.success(
        include
          ? "El equipo se contara en stock al costo"
          : "El equipo no se contara en stock al costo",
      );
      load();
    } catch (error) {
      toast.error("No se pudo actualizar el balance del equipo", {
        description: error?.message,
      });
    }
  };

  const openSaleDialog = (device) => {
    if (device.sold_sale_id != null)
      return toast.error("El equipo ya fue vendido desde postventa");
    if (device.status !== "defective_in_store") {
      return toast.error(
        "Solo podes vender desde postventa equipos defectuosos en local",
      );
    }
    resetSaleForm();
    setSellingDevice(device);
    setSaleForm((prev) => ({
      ...prev,
      unit_price_usd: String(Number(device.variant?.cost_price_usd || 0)),
    }));
    setSaleDialogOpen(true);
  };

  const updateSalePaymentField = (idx, field, value) => {
    setSaleForm((prev) => ({
      ...prev,
      payments: prev.payments.map((payment, index) =>
        index === idx ? { ...payment, [field]: value } : payment,
      ),
    }));
  };

  const addSalePaymentRow = () =>
    setSaleForm((prev) => ({
      ...prev,
      payments: [
        ...prev.payments,
        {
          payment_method_id: "",
          method_name: "",
          amount: "",
          installments: "",
          account_id: "",
          reference: "",
          multiplier: 1,
        },
      ],
    }));

  const removeSalePaymentRow = (idx) =>
    setSaleForm((prev) => ({
      ...prev,
      payments: prev.payments.filter((_, index) => index !== idx),
    }));

  const getAccountsForPayment = (payment) => {
    if (!payment?.method_name) return displayAccounts;
    return displayAccounts.filter(
      (account) =>
        account.currency === getPaymentDisplayCurrency(payment.method_name),
    );
  };

  const handleCreateSaleFromAftersales = async () => {
    if (!sellingDevice) return;
    if (!saleForm.customer_id) return toast.error("Selecciona un cliente");
    if (!fxRate) return toast.error("No hay cotizacion activa para USD");
    if (Number(saleForm.unit_price_usd || 0) < 0) {
      return toast.error("El precio no puede ser negativo");
    }

    const normalizedPayments = saleForm.payments
      .map((payment) => ({
        payment_method_id: payment.payment_method_id
          ? Number(payment.payment_method_id)
          : null,
        method_name: payment.method_name,
        installments: payment.installments
          ? Number(payment.installments)
          : null,
        multiplier: Number(payment.multiplier || 1),
        amount: Number(payment.amount || 0),
        account_id: payment.account_id ? Number(payment.account_id) : null,
        reference: payment.reference?.trim() || null,
      }))
      .filter((payment) => payment.payment_method_id && payment.amount > 0);

    if (saleTotalDueArs > 0 && !normalizedPayments.length) {
      return toast.error("Agrega al menos un metodo de pago");
    }
    if (normalizedPayments.some((payment) => !payment.account_id)) {
      return toast.error("Selecciona una cuenta para cada pago");
    }
    if (
      normalizedPayments.some(
        (payment) => payment.method_name?.toUpperCase() === "USD",
      ) &&
      !fxRate
    ) {
      return toast.error("No hay cotizacion activa para USD");
    }
    if (
      normalizedPayments.some(
        (payment) => payment.method_name?.toUpperCase() === "USDT",
      ) &&
      !usdtRate
    ) {
      return toast.error("No hay cotizacion activa para USDT");
    }

    const remainingDiff = Math.abs(salePaidArs - saleTotalDueArs);
    if (Math.round(remainingDiff) > ARS_TOLERANCE) {
      return toast.error(
        "El total pagado no coincide con el total de la venta",
      );
    }

    try {
      setSaleSubmitting(true);
      const { data, error } = await supabase.rpc("create_aftersales_sale", {
        p_aftersales_device_id: sellingDevice.id,
        p_customer_id: Number(saleForm.customer_id),
        p_seller_id: saleForm.seller_id || null,
        p_sales_channel_id: saleForm.channel_id
          ? Number(saleForm.channel_id)
          : null,
        p_unit_price_usd: Number(saleForm.unit_price_usd || 0),
        p_total_usd: Number((saleTotalDueArs / Number(fxRate)).toFixed(2)),
        p_total_ars: Number(saleTotalDueArs.toFixed(2)),
        p_fx_rate: Number(fxRate),
        p_notes: saleForm.notes.trim() || null,
        p_payments: normalizedPayments,
      });
      if (error) throw error;
      toast.success(`Venta generada desde postventa #${data?.sale_id || ""}`);
      setSaleDialogOpen(false);
      resetSaleForm();
      load();
    } catch (error) {
      toast.error("No se pudo generar la venta desde postventa", {
        description: error?.message,
      });
    } finally {
      setSaleSubmitting(false);
    }
  };

  if (!isAllowed) return <Navigate to="/unauthorized" replace />;

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total en postventa</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {summary.total}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Defectuoso en local</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-rose-600 dark:text-rose-300">
            {summary.defective_in_store}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">En reparacion</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-600 dark:text-amber-300">
            {summary.in_repair}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reparados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
            {summary.repaired}
          </CardContent>
        </Card>
      </div>

      <div>
        {/* <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"></div> */}
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex gap-2">
              <Input
                placeholder="Equipo, IMEI, venta..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
              />
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
              
                  <SelectItem value="defective_in_store">
                    Defectuoso en local
                  </SelectItem>
                  <SelectItem value="in_repair">En reparacion</SelectItem>
                  <SelectItem value="repaired">Reparado</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.source}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, source: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Origen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="factory">Fabrica</SelectItem>
                  <SelectItem value="warranty">Garantia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1 justify-end">
              <Button variant="outline" onClick={load} disabled={loading}>
                <IconRefresh className="h-4 w-4" />
                Actualizar
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <IconPlus className="h-4 w-4" />
                Agregar defecto de fabrica
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Stock costo</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      {device.created_at
                        ? new Date(device.created_at).toLocaleDateString(
                            "es-AR",
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>{formatVariantLabel(device.variant)}</TableCell>
                    <TableCell>{device.imei || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">
                          {SOURCE_LABELS[device.source_type] ||
                            device.source_type}
                        </Badge>
                        {device.sale_id ? (
                          <span className="text-xs text-muted-foreground">
                            Venta origen #{device.sale_id}
                          </span>
                        ) : null}
                        {device.sold_sale_id ? (
                          <span className="text-xs text-muted-foreground">
                            Vendida en #{device.sold_sale_id}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{device.quantity}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE[device.status]}
                        >
                          {STATUS_LABELS[device.status] || device.status}
                        </Badge>
                        {device.sold_sale_id ? (
                          <Badge variant="outline">Vendida</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {device.include_in_stock_cost_balance ? "Si" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {device.notes || device.warranty?.reason || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <IconDotsVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {device.sold_sale_id == null &&
                          device.status === "defective_in_store" ? (
                            <DropdownMenuItem
                              onClick={() => openSaleDialog(device)}
                            >
                              Vender desde postventa
                            </DropdownMenuItem>
                          ) : null}
                          {device.sold_sale_id == null &&
                          device.status !== "defective_in_store" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(device, "defective_in_store")
                              }
                            >
                              <IconShieldCheck className="h-4 w-4" />
                              Marcar defectuoso
                            </DropdownMenuItem>
                          ) : null}
                          {device.sold_sale_id == null &&
                          device.status !== "in_repair" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(device, "in_repair")
                              }
                            >
                              <IconTool className="h-4 w-4" />
                              Marcar en reparacion
                            </DropdownMenuItem>
                          ) : null}
                          {device.sold_sale_id == null &&
                          device.status !== "repaired" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(device, "repaired")
                              }
                            >
                              <IconRefresh className="h-4 w-4" />
                              Marcar reparado
                            </DropdownMenuItem>
                          ) : null}
                          {device.sold_sale_id == null ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleBalanceInclusionChange(
                                    device,
                                    !device.include_in_stock_cost_balance,
                                  )
                                }
                              >
                                <IconShieldCheck className="h-4 w-4" />
                                {device.include_in_stock_cost_balance
                                  ? "Excluir de stock al costo"
                                  : "Contar en stock al costo"}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      No hay equipos en postventa para los filtros
                      seleccionados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar equipo defectuoso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1">
              <Label>Variante</Label>
              <Select
                value={form.variant_id}
                onValueChange={(value) => {
                  const nextVariant = variants.find(
                    (variant) => String(variant.id) === String(value),
                  );
                  setForm((prev) => ({
                    ...prev,
                    variant_id: value,
                    quantity: isSerialTrackedVariant(nextVariant)
                      ? "1"
                      : prev.quantity,
                    imei: "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar variante" />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((variant) => (
                    <SelectItem key={variant.id} value={String(variant.id)}>
                      {formatVariantLabel(variant)} | Stock: {variant.stock}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity}
                  disabled={isSerialTrackedVariant(selectedAftersalesVariant)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>IMEI / SN</Label>
                <Input
                  placeholder="IMEI o serie del equipo"
                  value={form.imei}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, imei: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Notas</Label>
              <Textarea
                placeholder="Detalle del defecto o contexto"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-1">
                <Label className="text-sm">
                  Contabilizar en stock al costo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Activalo si este equipo defectuoso se vendera tal como esta y
                  queres incluirlo en Finanzas.
                </p>
              </div>
              <Switch
                checked={form.include_in_stock_cost_balance}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    include_in_stock_cost_balance: checked,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleRegister} disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={saleDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSaleDialogOpen(false);
            resetSaleForm();
          }
        }}
      >
        <DialogContent className="w-[90vw] sm:max-w-2xl max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vender desde postventa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                <strong>Equipo:</strong>{" "}
                {formatVariantLabel(sellingDevice?.variant)}
              </p>
              <p>
                <strong>IMEI:</strong> {sellingDevice?.imei || "-"}
              </p>
              <p>
                <strong>Cantidad:</strong> {sellingDevice?.quantity || 0}
              </p>
              <p>
                <strong>Costo sugerido:</strong>{" "}
                {formatUSD(Number(sellingDevice?.variant?.cost_price_usd || 0))}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select
                  value={saleForm.customer_id}
                  onValueChange={(value) =>
                    setSaleForm((prev) => ({ ...prev, customer_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {formatPersonName(customer.name, customer.last_name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vendedor (opcional)</Label>
                <Select
                  value={saleForm.seller_id}
                  onValueChange={(value) =>
                    setSaleForm((prev) => ({ ...prev, seller_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map((seller) => (
                      <SelectItem
                        key={seller.id_auth}
                        value={String(seller.id_auth)}
                      >
                        {formatPersonName(seller.name, seller.last_name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Canal de venta</Label>
                <Select
                  value={saleForm.channel_id}
                  onValueChange={(value) =>
                    setSaleForm((prev) => ({ ...prev, channel_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar canal" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesChannels.map((channel) => (
                      <SelectItem key={channel.id} value={String(channel.id)}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Precio unitario USD</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleForm.unit_price_usd}
                  onChange={(e) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      unit_price_usd: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Detalle de la venta desde postventa"
                value={saleForm.notes}
                onChange={(e) =>
                  setSaleForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <p>
                <strong>Total base:</strong> {formatARS(saleBaseTotalArs)}
              </p>
              <p>
                <strong>Total final:</strong> {formatARS(saleTotalDueArs)}
              </p>
              <p>
                <strong>Pagado:</strong> {formatARS(salePaidArs)}
              </p>
              <p
                className={
                  saleRemaining === 0 ? "text-green-600" : "text-blue-600"
                }
              >
                <strong>Restante:</strong> {formatARS(saleRemaining)}
              </p>
              <p className="text-xs text-muted-foreground">
                Se permite una diferencia maxima de {formatARS(ARS_TOLERANCE)}.
              </p>
              {selectedCustomer ? (
                <p className="text-xs text-muted-foreground">
                  Cliente:{" "}
                  {formatPersonName(
                    selectedCustomer.name,
                    selectedCustomer.last_name,
                  )}
                </p>
              ) : null}
              {selectedSeller ? (
                <p className="text-xs text-muted-foreground">
                  Vendedor:{" "}
                  {formatPersonName(
                    selectedSeller.name,
                    selectedSeller.last_name,
                  )}
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
              <Label>Metodos de pago</Label>
              {saleForm.payments.map((payment, index) => {
                const accountsForPayment = getAccountsForPayment(payment);
                const installmentsOptions = getInstallmentsForMethod(
                  payment.payment_method_id,
                );
                return (
                  <div key={index} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={
                          payment.payment_method_id
                            ? String(payment.payment_method_id)
                            : ""
                        }
                        onValueChange={(value) => {
                          const chosen = paymentMethods.find(
                            (method) => String(method.id) === String(value),
                          );
                          updateSalePaymentField(
                            index,
                            "payment_method_id",
                            value,
                          );
                          updateSalePaymentField(
                            index,
                            "method_name",
                            chosen?.name || "",
                          );
                          updateSalePaymentField(index, "installments", "");
                          updateSalePaymentField(index, "amount", "");
                          updateSalePaymentField(index, "account_id", "");
                          updateSalePaymentField(
                            index,
                            "multiplier",
                            Number(chosen?.multiplier || 1),
                          );
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Metodo de pago..." />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem
                              key={method.id}
                              value={String(method.id)}
                            >
                              {method.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {installmentsOptions.length > 0 ? (
                        <Select
                          value={payment.installments || ""}
                          onValueChange={(value) => {
                            const inst = installmentsOptions.find(
                              (item) => item.installments === Number(value),
                            );
                            updateSalePaymentField(
                              index,
                              "installments",
                              value,
                            );
                            updateSalePaymentField(
                              index,
                              "multiplier",
                              Number(inst?.multiplier || 1),
                            );
                            updateSalePaymentField(index, "amount", "");
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Cuotas" />
                          </SelectTrigger>
                          <SelectContent>
                            {installmentsOptions.map((inst) => (
                              <SelectItem
                                key={inst.id}
                                value={String(inst.installments)}
                              >
                                {inst.installments} cuotas
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {saleForm.payments.length > 1 ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeSalePaymentRow(index)}
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </div>
                    <Select
                      value={
                        payment.account_id ? String(payment.account_id) : ""
                      }
                      onValueChange={(value) =>
                        updateSalePaymentField(index, "account_id", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Cuenta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsForPayment.map((account) => (
                          <SelectItem
                            key={account.id}
                            value={String(account.id)}
                          >
                            {account.name} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 items-end">
                      <Input
                        className="flex-1"
                        type="number"
                        placeholder={`Monto (${getPaymentDisplayCurrency(payment.method_name)})`}
                        value={payment.amount}
                        onChange={(e) =>
                          updateSalePaymentField(
                            index,
                            "amount",
                            e.target.value,
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          !payment.payment_method_id ||
                          (installmentsOptions.length > 0 &&
                            !payment.installments)
                        }
                        onClick={() => {
                          if (isUsdMethod(payment.method_name)) {
                            const rate = getPaymentFxRate(payment.method_name);
                            if (!rate)
                              return toast.error(
                                `No hay cotizacion activa para ${getPaymentDisplayCurrency(payment.method_name)}`,
                              );
                            updateSalePaymentField(
                              index,
                              "amount",
                              String((saleRemaining / rate).toFixed(2)),
                            );
                            return;
                          }
                          updateSalePaymentField(
                            index,
                            "amount",
                            String(saleRemaining),
                          );
                        }}
                      >
                        Completar
                      </Button>
                    </div>
                    <Input
                      placeholder="Referencia (opcional)"
                      value={payment.reference || ""}
                      onChange={(e) =>
                        updateSalePaymentField(
                          index,
                          "reference",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                onClick={addSalePaymentRow}
              >
                Agregar metodo de pago
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaleDialogOpen(false);
                resetSaleForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSaleFromAftersales}
              disabled={saleSubmitting}
            >
              {saleSubmitting ? "Guardando..." : "Generar venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
