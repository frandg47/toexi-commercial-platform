import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCoin,
  IconCash,
  IconCreditCard,
  IconBuildingBank,
  IconTrash,
  IconCirclePlus,
  IconPackage,
  IconDownload,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { generateSalePDF } from "@/utils/generateSalePDF";
import { getReceivedItems, getTotalReceivedArs } from "@/utils/tradeInHelpers";

export default function DialogCollectSale({ open, onOpenChange, sale, onConfirm, loading, exchangeRate, usdtRate, tradeInCredit = 0, virtualAccounts = [], cajaAccounts = [] }) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentInstallments, setPaymentInstallments] = useState([]);

  const [payments, setPayments] = useState([]);
  const [discount, setDiscount] = useState({ type: "none", value: 0 });
  const [surcharge, setSurcharge] = useState({ type: "none", value: 0 });
  const [notes, setNotes] = useState("");

  const [collectionSuccess, setCollectionSuccess] = useState(false);
  const [collectedPaymentData, setCollectedPaymentData] = useState(null);
  const [sellerData, setSellerData] = useState(null);
  const [payoutAccountId, setPayoutAccountId] = useState("");

  useEffect(() => {
    if (!open) return;
    const fetchLookups = async () => {
      const [methodsRes, installmentsRes] = await Promise.all([
          supabase.from("payment_methods").select("id, name, multiplier, account_id, accreditation_delay_business_days, accounts(id, name, currency)").eq("is_active", true),
        supabase.from("payment_installments").select("id, payment_method_id, installments, multiplier"),
      ]);
      setPaymentMethods(methodsRes.data || []);
      setPaymentInstallments(installmentsRes.data || []);
    };
    fetchLookups();
  }, [open]);

  useEffect(() => {
    if (open && sale) {
       setPayments([{ payment_method_id: "", method_name: "", method: "", amount: "", reference: "", destination_account_id: "", installments: "", multiplier: 1, account_id: null, account_name: "", accreditation_delay_business_days: 0 }]);
      setDiscount({ type: "none", value: 0 });
      setSurcharge({ type: "none", value: 0 });
      setNotes("");
      setCollectionSuccess(false);
      setCollectedPaymentData(null);
      setSellerData(null);
      setPayoutAccountId("");

      if (sale.seller_id) {
        supabase
          .from("users")
          .select("name, last_name, phone")
          .eq("id_auth", sale.seller_id)
          .single()
          .then(({ data }) => setSellerData(data));
      }
    }
  }, [open, sale]);

  const baseTotal = useMemo(() => Number(sale?.total_ars) || 0, [sale]);

  const discountAmount = useMemo(() => {
    if (discount.type === "percent") return baseTotal * (discount.value / 100);
    if (discount.type === "fixed") return discount.value;
    return 0;
  }, [discount, baseTotal]);

  const surchargeAmount = useMemo(() => {
    if (surcharge.type === "percent") return baseTotal * (surcharge.value / 100);
    if (surcharge.type === "fixed") return surcharge.value;
    return 0;
  }, [surcharge, baseTotal]);

  const totalAfterAdjustments = useMemo(() => Math.max(baseTotal - discountAmount + surchargeAmount, 0), [baseTotal, discountAmount, surchargeAmount]);

  const depositData = useMemo(() => {
    if (!sale?.deposit_paid) return { amount: 0, currency: "ARS", amountARS: 0 };
    const amount = Number(sale.deposit_amount || 0);
    const currency = sale.deposit_currency || "ARS";
    const amountARS = currency === "USD" && exchangeRate ? amount * exchangeRate : amount;
    return { amount, currency, amountARS };
  }, [sale, exchangeRate]);

  const totalDue = useMemo(() => totalAfterAdjustments - depositData.amountARS - tradeInCredit, [totalAfterAdjustments, depositData.amountARS, tradeInCredit]);

  const getPaymentDisplayCurrency = (methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return "USDT";
    if (upper === "USD") return "USD";
    return "ARS";
  };

  const isUSDMethod = (methodName) => ["USD", "USDT"].includes(methodName?.toUpperCase());

  const getPaymentFxRate = useCallback((methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return usdtRate;
    if (upper === "USD") return exchangeRate;
    return 1;
  }, [exchangeRate, usdtRate]);

  const allocatedARS = useMemo(() => {
    return payments.reduce((acc, p) => {
      const amount = Number(p.amount || 0);
      if (isUSDMethod(p.method_name)) {
        const rate = getPaymentFxRate(p.method_name);
        if (rate) return acc + amount * rate;
      }
      return acc + amount;
    }, 0);
  }, [payments, getPaymentFxRate]);

  const paidARS = useMemo(() => {
    return payments.reduce((acc, p) => {
      const amount = Number(p.amount || 0);
      const multiplier = Number(p.multiplier || 1);
      const rate = isUSDMethod(p.method_name) ? getPaymentFxRate(p.method_name) : 1;
      return acc + (rate ? amount * rate * multiplier : amount);
    }, 0);
  }, [payments, getPaymentFxRate]);

  const surchargeByPayment = useMemo(() => {
    return payments.reduce((acc, p) => {
      const amount = Number(p.amount || 0);
      const multiplier = Math.max(Number(p.multiplier || 1), 1);
      const rate = isUSDMethod(p.method_name) ? getPaymentFxRate(p.method_name) : 1;
      return acc + (rate ? amount * rate * (multiplier - 1) : 0);
    }, 0);
  }, [payments, getPaymentFxRate]);

  const remaining = useMemo(() => Math.max(totalDue - allocatedARS, 0), [totalDue, allocatedARS]);

  const hasMissingAccount = useMemo(
    () => payments.some((payment) => {
      if (!payment.payment_method_id) return false;
      if (payment.method?.toLowerCase() === "transferencia") {
        return !payment.destination_account_id;
      }
      return !payment.account_id;
    }),
    [payments],
  );

  const getInstallmentsForMethod = (methodId) => {
    if (!methodId) return [];
    return paymentInstallments.filter((inst) => inst.payment_method_id === Number(methodId));
  };

  const addPaymentRow = () =>
    setPayments((p) => [
      ...p,
       { payment_method_id: "", method_name: "", method: "", amount: "", reference: "", installments: "", multiplier: 1, account_id: null, account_name: "", accreditation_delay_business_days: 0 },
    ]);

  const removePaymentRow = (idx) => setPayments((p) => p.filter((_, i) => i !== idx));

  const updatePaymentField = (idx, field, value) =>
    setPayments((p) => p.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const methodIcon = (m) => {
    if (m === "efectivo") return <IconCash className="h-4 w-4" />;
    if (m === "transferencia") return <IconBuildingBank className="h-4 w-4" />;
    return <IconCreditCard className="h-4 w-4" />;
  };

  const formatARS = (n) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n || 0);

  const formatAuditAmount = (amount, currency) =>
    currency === "ARS" ? formatARS(amount) : `${currency} ${Number(amount || 0).toFixed(2)}`;

  const handleConfirm = async () => {
    if (!sale) return;

    // Caso: diferencia a favor del cliente (pago al cliente)
    if (totalDue < 0) {
      if (!payoutAccountId) {
        toast.error("Seleccioná la cuenta de origen para el pago");
        return;
      }
      const payoutAccount = cajaAccounts.find((a) => String(a.id) === String(payoutAccountId));
      const payoutData = {
        isPayout: true,
        payout_account_id: Number(payoutAccountId),
        payout_amount_ars: Math.abs(totalDue),
        payout_account_name: payoutAccount?.name || "",
        notes,
      };
      const result = await onConfirm(payoutData);
      if (result?.ok) {
        setCollectionSuccess(true);
        setCollectedPaymentData({
          ...payoutData,
          payments: [],
          total_ars: Math.abs(totalDue),
          discount_amount: 0,
          surcharge_amount: 0,
          accreditationAudit: result.accreditationAudit || [],
        });
      } else {
        toast.error(result?.error || "No se pudo registrar el pago");
      }
      return;
    }

    // Caso normal: cobro al cliente
    const normalized = payments
      .map((p) => {
        const amount = Number(p.amount || 0);
        const isUsd = isUSDMethod(p.method_name);
        const rate = isUsd ? getPaymentFxRate(p.method_name) : 1;
        const multiplier = Math.max(Number(p.multiplier || 1), 1);
        const chargedAmount = amount * multiplier;
        return {
          payment_method_id: p.payment_method_id,
          method_name: p.method_name,
          installments: p.installments || null,
          multiplier: p.multiplier || 1,
          amount,
          charged_amount: chargedAmount,
          amount_ars: isUsd && rate ? chargedAmount * rate : chargedAmount,
          base_amount_ars: isUsd && rate ? amount * rate : amount,
          reference: p.reference || null,
          destination_account_id: p.destination_account_id || null,
          account_id: p.destination_account_id || p.account_id || null,
          account_name: p.destination_account_id
            ? virtualAccounts.find((account) => String(account.id) === String(p.destination_account_id))?.name || ""
            : p.account_name || "",
          accreditation_delay_business_days: Number(p.accreditation_delay_business_days || 0),
        };
      })
      .filter((p) => p.payment_method_id && p.amount > 0);

    if (totalDue > 0 && !normalized.length) {
      toast.error("Agregá al menos un método de pago");
      return;
    }

    // Validate transfers have a destination account
    const missingAccount = normalized.find(
      (p) => p.method_name?.toLowerCase() === "transferencia" && !p.destination_account_id
    );
    if (missingAccount) {
      toast.error("Seleccioná la cuenta destino para la transferencia");
      return;
    }

    const remainingDiff = Math.abs(allocatedARS - totalDue);
    const toleranceARS = 1000;
    const toleranceUSD = 1;
    const toleranceInARS = toleranceARS + (exchangeRate ? toleranceUSD * exchangeRate : 0);
    if (remainingDiff > toleranceInARS) {
      toast.error("El total pagado no coincide con el total de la venta");
      return;
    }

    const paymentData = {
      payments: normalized,
      discount_type: discount.type,
      discount_value: discount.value,
      discount_amount: discountAmount,
      surcharge_type: surcharge.type,
      surcharge_value: surcharge.value,
      surcharge_amount: surchargeAmount,
      total_ars: totalDue,
      total_paid: paidARS,
      payment_surcharge_amount: surchargeByPayment,
      currency: "ARS",
      notes,
      trade_in_credit: tradeInCredit,
    };

    const result = await onConfirm(paymentData);
    if (result?.ok) {
      setCollectionSuccess(true);
       setCollectedPaymentData({
         ...paymentData,
         payments: normalized,
         accreditationAudit: result.accreditationAudit || [],
       });
    } else {
      toast.error(result?.error || "No se pudo cobrar la venta");
    }
  };

  const handleDownloadReceipt = () => {
    if (!sale || !collectedPaymentData) return;

    const pdfSale = {
      sale_id: sale.id,
      sale_date: sale.sale_date,
      customer_name: sale.customers?.name,
      customer_last_name: sale.customers?.last_name,
      customer_phone: sale.customers?.phone,
      seller_name: sellerData?.name || "",
      seller_last_name: sellerData?.last_name || "",
      seller_phone: sellerData?.phone || "",
      sale_type: sale.sale_type || "standard",
      trade_in_data: sale.trade_in_data || null,
      items: sale.sale_items?.map((item) => ({
        product_name: item.product_name,
        variant_name: item.variant_name,
        color: item.color,
        quantity: item.quantity,
        usd_price: item.usd_price,
        subtotal_usd: exchangeRate ? Number(item.subtotal_ars || 0) / exchangeRate : 0,
        is_gift: item.is_gift,
      })) || [],
      payments: collectedPaymentData.payments.map((p) => ({
        payment_method_name: p.method_name,
        installments: p.installments,
         amount_ars: isUSDMethod(p.method_name)
           ? Number(p.charged_amount || p.amount || 0) * (getPaymentFxRate(p.method_name) || 0)
           : Number(p.charged_amount || p.amount || 0),
         amount_usd: isUSDMethod(p.method_name) ? Number(p.charged_amount || p.amount || 0) : null,
      })),
      total_ars: collectedPaymentData.total_ars,
      discount_amount: collectedPaymentData.discount_amount,
      surcharge_amount: collectedPaymentData.surcharge_amount,
      fx_rate_used: exchangeRate || 0,
      trade_in_credit: tradeInCredit,
      notes: collectedPaymentData.notes,
      status: "vendido",
    };

    generateSalePDF(pdfSale);
  };

  const handleClose = () => {
    const isPayout = collectedPaymentData?.isPayout;
    toast.success(isPayout ? "Pago al cliente registrado" : "Venta cobrada y registrada en caja");
    onOpenChange(false);
  };

  if (!sale) return null;

  if (collectionSuccess) {
    const isPayout = collectedPaymentData?.isPayout;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-600">{isPayout ? "Pago registrado" : "Cobro exitoso"}</DialogTitle>
            <DialogDescription>
              {isPayout
                ? `Se registró el pago de ${formatARS(collectedPaymentData?.payout_amount_ars || 0)} al cliente desde ${collectedPaymentData?.payout_account_name || "cuenta"}.`
                : "La venta fue cobrada y registrada en caja correctamente."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Venta #{String(sale.id).padStart(6, "0")} - {formatARS(collectedPaymentData?.total_ars || 0)}
            </p>
            {!isPayout && (
              <div className="rounded-md border p-3 text-left space-y-2">
                <p className="text-sm font-medium">Auditoría de acreditación</p>
                {collectedPaymentData?.accreditationAudit?.map((payment, index) => (
                  <div key={`${payment.method_name}-${index}`} className="text-xs text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>{payment.method_name}{payment.installments ? ` (${payment.installments} cuotas)` : ""}</span>
                      <span className="font-medium text-foreground">{formatAuditAmount(payment.amount, payment.currency)}</span>
                    </div>
                    <div>
                      Neto: {formatAuditAmount(payment.net_amount, payment.currency)} · Cuenta: {payment.account_name || "Sin cuenta"}
                    </div>
                    <div>
                      {payment.accreditation_status === "pending"
                        ? `Pendiente hasta ${payment.available_on}`
                        : "Acreditación inmediata"}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isPayout && (
              <Button variant="outline" onClick={handleDownloadReceipt} className="gap-2">
                <IconDownload className="h-4 w-4" />
                Descargar comprobante
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconCoin className="h-5 w-5 text-primary" />
            {sale?.sale_type === "canje" ? "Cobrar Canje" : sale?.sale_type === "warranty" ? "Cobrar Garantía" : "Cobrar Venta Pendiente"}
          </DialogTitle>
          <DialogDescription>
            Configurá los pagos y confirmá el cobro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info de la venta */}
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cliente:</span>
              <span className="font-medium">{(sale.customers?.name || "Sin cliente").toUpperCase()}{sale.customers?.last_name && ` ${sale.customers.last_name.toUpperCase()}`}</span>
            </div>
            {(sale?.sale_type === "canje" || sale?.sale_type === "warranty") && sale?.trade_in_data && (() => {
              const items = getReceivedItems(sale.trade_in_data);
              const total = getTotalReceivedArs(sale.trade_in_data);
              return (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{sale?.sale_type === "canje" ? "Canje:" : "Garantía:"}</span>
                  <span className="font-medium text-green-600">
                    {items.length === 1
                      ? `${items[0].product_name} ${items[0].variant_name}${items[0].imei ? ` (${items[0].imei})` : ""}`
                      : `${items.length} producto${items.length > 1 ? "s" : ""} recibido${items.length > 1 ? "s" : ""}`
                    }
                    {" — "}
                    {formatARS(total)}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Lista de productos */}
          {sale.sale_items && sale.sale_items.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2">
                <IconPackage className="h-4 w-4" />
                Productos ({sale.sale_items.length})
              </div>
              <div className="divide-y">
                {sale.sale_items.map((item, idx) => (
                  <div key={item.id || idx} className="px-3 py-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[item.variant_name, item.color, item.storage, item.ram].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <p className="font-medium">{formatARS(item.subtotal_ars)}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity}x {formatARS(item.usd_price * (exchangeRate || 1))}
                        </p>
                      </div>
                    </div>
                    {item.is_gift && (
                      <span className="inline-block mt-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                        REGALO
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descuento */}
          <div className="border p-3 rounded-md bg-muted/20 space-y-2">
            <label className="text-sm font-medium">Descuento</label>
            <div className="flex gap-2">
              <Select value={discount.type} onValueChange={(v) => setDiscount({ type: v, value: 0 })}>
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
                  onChange={(e) => setDiscount((d) => ({ ...d, value: Number(e.target.value) }))}
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Recargo */}
          <div className="border p-3 rounded-md bg-muted/20 space-y-2">
            <label className="text-sm font-medium">Recargo</label>
            <div className="flex gap-2">
              <Select value={surcharge.type} onValueChange={(v) => setSurcharge({ type: v, value: 0 })}>
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
                  placeholder={surcharge.type === "percent" ? "% recargo" : "$ recargo"}
                  value={surcharge.value}
                  onChange={(e) => setSurcharge((s) => ({ ...s, value: Number(e.target.value) }))}
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Métodos de pago - solo cuando hay monto a pagar */}
          {totalDue >= 0 && (
            <>
              <h3 className="font-medium">Métodos de Pago</h3>

              {payments.map((p, i) => {
            return (
              <div key={i} className="border p-3 rounded-md space-y-3 bg-muted/40">
                <div className="flex items-center gap-2">
                  {methodIcon(p.method)}
                  <Select
                    value={p.payment_method_id ? String(p.payment_method_id) : ""}
                    onValueChange={(val) => {
                      const chosen = paymentMethods.find((m) => String(m.id) === val);
                       updatePaymentField(i, "payment_method_id", val);
                       updatePaymentField(i, "method_name", chosen?.name);
                       updatePaymentField(i, "method", chosen?.name?.toLowerCase());
                       updatePaymentField(i, "account_id", chosen?.account_id || null);
                       updatePaymentField(i, "account_name", chosen?.accounts?.name || "");
                       updatePaymentField(i, "accreditation_delay_business_days", chosen?.accreditation_delay_business_days || 0);
                       updatePaymentField(i, "installments", "");
                      updatePaymentField(i, "multiplier", chosen?.multiplier || 1);
                      updatePaymentField(i, "amount", "");
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
                  {p.payment_method_id && p.method !== "transferencia" && (
                    <p className={`text-xs ${p.account_id ? "text-muted-foreground" : "text-destructive"}`}>
                      {p.account_id
                        ? `Acredita en: ${p.account_name || "Cuenta configurada"}`
                        : "Este método no tiene una cuenta de acreditación configurada"}
                    </p>
                  )}

                  {getInstallmentsForMethod(p.payment_method_id).length > 0 && (
                    <Select
                      value={p.installments || ""}
                      onValueChange={(val) => {
                        const inst = getInstallmentsForMethod(p.payment_method_id).find((x) => x.installments === Number(val));
                        updatePaymentField(i, "installments", val);
                        updatePaymentField(i, "multiplier", inst?.multiplier || 1);
                        updatePaymentField(i, "amount", "");
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Cuotas" />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]">
                        {getInstallmentsForMethod(p.payment_method_id).map((inst) => (
                          <SelectItem key={inst.id} value={inst.installments.toString()}>
                            {inst.installments} cuotas
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {payments.length > 1 && (
                    <Button variant="destructive" size="icon" onClick={() => removePaymentRow(i)} title="Eliminar">
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="flex gap-2 items-end">
                       <Input
                         className="flex-1"
                         placeholder={`Importe base (${getPaymentDisplayCurrency(p.method_name)})`}
                      type="number"
                      value={p.amount}
                      onChange={(e) => updatePaymentField(i, "amount", e.target.value)}
                    />
                    {i === payments.length - 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!p.payment_method_id || (getInstallmentsForMethod(p.payment_method_id).length > 0 && !p.installments)}
                        onClick={() => {
                          if (!p.payment_method_id) return;
                          if (isUSDMethod(p.method_name)) {
                            const rate = getPaymentFxRate(p.method_name);
                            if (!rate) {
                              toast.error(`No hay cotización activa para ${getPaymentDisplayCurrency(p.method_name)}`);
                              return;
                            }
                             updatePaymentField(i, "amount", String((remaining / rate).toFixed(2)));
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
                    <Select
                      value={p.destination_account_id ? String(p.destination_account_id) : ""}
                      onValueChange={(val) => updatePaymentField(i, "destination_account_id", val)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Cuenta destino..." />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]">
                        {virtualAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>
                            {acc.name} ({acc.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {(p.method?.includes("tarjeta") || p.method?.includes("card")) && (
                    <Input
                      placeholder="Nro. autorización / referencia"
                      value={p.reference || ""}
                      onChange={(e) => updatePaymentField(i, "reference", e.target.value)}
                    />
                  )}
                </div>
              </div>
            );
          })}

          <Button variant="outline" onClick={addPaymentRow} className="w-full">
            <IconCirclePlus className="h-4 w-4 mr-1" />
            Agregar otro pago
          </Button>
            </>
          )}

          {/* Sección de pago al cliente - cuando la diferencia es a favor del cliente */}
          {totalDue < 0 && (
            <div className="border p-4 rounded-md bg-green-50 dark:bg-green-950/20 space-y-3">
              <h3 className="font-medium text-green-700 dark:text-green-400">Diferencia a favor del cliente</h3>
              <p className="text-sm text-muted-foreground">
                El producto recibido tiene mayor valor. Se debe abonar al cliente:
              </p>
              <div className="text-2xl font-bold text-green-600">{formatARS(Math.abs(totalDue))}</div>
              <div className="space-y-1">
                <Label className="text-sm">Cuenta de origen</Label>
                <Select value={payoutAccountId} onValueChange={setPayoutAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta..." />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {cajaAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.name} ({acc.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Totales */}
          <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
            <div className="text-muted-foreground">Total base:</div>
            <div className="text-right font-semibold">{formatARS(baseTotal)}</div>

            {payments.map((p, i) => {
              if (!p.payment_method_id) return null;
              const amount = Number(p.amount || 0);
              const displayCurrency = getPaymentDisplayCurrency(p.method_name);
              const isUsdLike = displayCurrency !== "ARS";
               const multiplier = Math.max(Number(p.multiplier || 1), 1);
               const chargedAmount = amount * multiplier;
               const displayAmount = isUsdLike ? `${displayCurrency} ${amount.toFixed(2)}` : formatARS(amount);
               const rate = isUsdLike ? getPaymentFxRate(p.method_name) : 1;
               const arsEquivalent = isUsdLike && rate ? amount * rate : amount;
               const surchargeAmount = amount * (multiplier - 1);
               const surchargeDisplayAmount = isUsdLike ? `${displayCurrency} ${surchargeAmount.toFixed(2)}` : formatARS(surchargeAmount);
               const chargedDisplayAmount = isUsdLike ? `${displayCurrency} ${chargedAmount.toFixed(2)}` : formatARS(chargedAmount);

              return (
                <div key={i} className="col-span-2 flex justify-between">
                  <div className="text-muted-foreground">{p.method_name || "Método"}:</div>
                  <div className="text-right">
                     <div>Base: {displayAmount}</div>
                     {multiplier > 1 && (
                       <>
                         <div className="text-orange-600">Recargo ({((multiplier - 1) * 100).toFixed(2)}%): {surchargeDisplayAmount}</div>
                         <div className="font-medium text-orange-600">Total cobrado: {chargedDisplayAmount}</div>
                       </>
                     )}
                     {isUsdLike && rate && <div className="text-xs text-muted-foreground">{formatARS(arsEquivalent)}</div>}
                  </div>
                </div>
              );
            })}

            {discount.type !== "none" && discountAmount > 0 && (
              <>
                <div className="text-muted-foreground">Descuento:</div>
                <div className="text-right text-green-600 font-semibold">- {formatARS(discountAmount)}</div>
              </>
            )}

             {surcharge.type !== "none" && surchargeAmount > 0 && (
              <>
                <div className="text-muted-foreground">Recargo:</div>
                <div className="text-right text-orange-600 font-semibold">{formatARS(surchargeAmount)}</div>
              </>
            )}

            {surchargeByPayment > 0 && (
              <>
                <div className="text-muted-foreground">Recargo por método/cuota:</div>
                <div className="text-right text-orange-600 font-semibold">{formatARS(surchargeByPayment)}</div>
              </>
            )}

            {depositData.amountARS > 0 && (
              <>
                <div className="text-muted-foreground">Seña aplicada:</div>
                <div className="text-right text-amber-600 font-semibold">
                  <div>{formatARS(depositData.amountARS)}</div>
                  {depositData.currency === "USD" && depositData.amount > 0 && (
                    <div className="text-xs text-muted-foreground">USD {depositData.amount.toFixed(2)}</div>
                  )}
                </div>
              </>
            )}

            {tradeInCredit > 0 && (
              <>
                <div className="text-muted-foreground">{sale?.sale_type === "warranty" ? "Crédito garantía:" : "Crédito canje:"}</div>
                <div className="text-right text-green-600 font-semibold">- {formatARS(tradeInCredit)}</div>
              </>
            )}

            {totalDue >= 0 ? (
              <>
                <div className="text-muted-foreground font-medium border-t mt-2 pt-2">Total a pagar ahora:</div>
                <div className="text-right font-bold text-primary border-t mt-2 pt-2">{formatARS(totalDue)}</div>
              </>
            ) : (
              <>
                <div className="text-green-600 font-medium border-t mt-2 pt-2">A favor del cliente:</div>
                <div className="text-right font-bold text-green-600 border-t mt-2 pt-2">{formatARS(Math.abs(totalDue))}</div>
              </>
            )}

            {totalDue >= 0 && (
              <>
                <div className="text-muted-foreground">Total cobrado:</div>
                <div className={`text-right font-semibold ${Math.round(paidARS) === Math.round(totalDue) ? "text-green-600" : "text-red-600"}`}>
                  <div>{formatARS(paidARS)}</div>
                  {payments.some((p) => isUSDMethod(p.method_name)) && (
                    <div className="text-xs text-muted-foreground">
                      {payments.filter((p) => isUSDMethod(p.method_name)).map((p, i) => {
                        const displayCurrency = getPaymentDisplayCurrency(p.method_name);
                        const amount = Number(p.amount || 0);
                        return (
                          <div key={i}>
                            {displayCurrency} {amount.toFixed(2)} ({p.method_name})
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {totalDue >= 0 && (
              <>
                <div className="text-muted-foreground">Base pendiente:</div>
                <div className={`text-right font-bold ${remaining === 0 ? "text-green-600" : "text-blue-600"}`}>{formatARS(remaining)}</div>
              </>
            )}
          </div>

          <Textarea
            placeholder="Notas de la operación (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (totalDue >= 0 && hasMissingAccount) || (totalDue < 0 && !payoutAccountId)}
            className={totalDue < 0 ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {loading ? "Procesando..." : totalDue < 0 ? "Registrar pago al cliente" : "Confirmar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
