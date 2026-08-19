import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import {
  IconCash,
  IconCreditCard,
  IconBuildingBank,
  IconTrash,
  IconCirclePlus,
} from "@tabler/icons-react";

export default function PaymentCalculatorDialog({ open, onOpenChange }) {
  // Subtotal en USD que ingresa el vendedor
  const [subtotalUSD, setSubtotalUSD] = useState("");

  // Cotización, métodos y cuotas desde Supabase
  const [exchangeRate, setExchangeRate] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentInstallments, setPaymentInstallments] = useState([]);

  // Pagos mixtos
  const [payments, setPayments] = useState([
    {
      payment_method_id: "",
      method_name: "",
      method: "",
      installments: "",
      multiplier: 1,
      amount: "",
      reference: "",
    },
  ]);

  // Notas de la simulación
  const [notes, setNotes] = useState("");

  const formatARS = (n) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(n || 0);

  // ================== FETCH A SUPABASE ==================

  useEffect(() => {
    if (!open) return; // solo cuando se abre el diálogo

    const fetchData = async () => {
      // Cotización activa
      const { data: fx } = await supabase
        .from("fx_rates")
        .select("rate")
        .eq("is_active", true)
        .eq("source", "blue")
        .maybeSingle();

      if (fx?.rate) setExchangeRate(Number(fx.rate));

      // Métodos de pago
      const { data: methods } = await supabase
        .from("payment_methods")
        .select("id, name, multiplier");

      setPaymentMethods(methods || []);

      // Cuotas por método
      const { data: installments } = await supabase
        .from("payment_installments")
        .select("id, payment_method_id, installments, multiplier");

      setPaymentInstallments(installments || []);
    };

    fetchData();
  }, [open]);

  // ================== CÁLCULOS (MISMO CRITERIO QUE PASO 3) ==================

  const subtotalUSDNumber = useMemo(
    () => Number(subtotalUSD) || 0,
    [subtotalUSD]
  );

  // Total base en ARS sin recargos
  const baseTotal = useMemo(() => {
    if (!exchangeRate) return 0;
    return subtotalUSDNumber * exchangeRate;
  }, [subtotalUSDNumber, exchangeRate]);

  // Pagos sin interés
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
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  }, [payments, paymentInstallments]);

  // Saldo después de pagos sin interés
  const saldo = useMemo(
    () => Math.max(baseTotal - paidNoInterest, 0),
    [baseTotal, paidNoInterest]
  );

  // Método con interés (si existe)
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

  // Multiplicador de interés
  const interestMultiplier = useMemo(() => {
    if (!interestMethod) return 1;
    const info = paymentInstallments.find(
      (i) =>
        i.payment_method_id === Number(interestMethod.payment_method_id) &&
        i.installments === Number(interestMethod.installments)
    );
    return info?.multiplier || 1;
  }, [interestMethod, paymentInstallments]);

  // Total final con recargo
  const totalWithSurcharge = useMemo(() => {
    if (!interestMethod) return baseTotal;
    const interestPart = saldo * (interestMultiplier - 1);
    return baseTotal + interestPart;
  }, [baseTotal, saldo, interestMethod, interestMultiplier]);

  // Cuánto se cargó en pagos (suma de montos ingresados)
  const paidARS = useMemo(
    () => payments.reduce((acc, p) => acc + Number(p.amount || 0), 0),
    [payments]
  );

  // Restante
  const remaining = useMemo(
    () => Math.max(totalWithSurcharge - paidARS, 0),
    [totalWithSurcharge, paidARS]
  );

  // ================== HELPERS UI ==================

  const methodIcon = (m) => {
    if (m === "efectivo") return <IconCash className="h-4 w-4" />;
    if (m === "transferencia") return <IconBuildingBank className="h-4 w-4" />;
    if (m === "tarjeta") return <IconCreditCard className="h-4 w-4" />;
    return null;
  };

  const getInstallmentsForMethod = (methodId) => {
    if (!methodId) return [];
    return paymentInstallments.filter(
      (inst) => inst.payment_method_id === Number(methodId)
    );
  };

  const addPaymentRow = () =>
    setPayments((prev) => [
      ...prev,
      {
        payment_method_id: "",
        method_name: "",
        method: "",
        installments: "",
        multiplier: 1,
        amount: "",
        reference: "",
      },
    ]);

  const removePaymentRow = (idx) =>
    setPayments((prev) => prev.filter((_, i) => i !== idx));

  const updatePaymentField = (idx, field, value) =>
    setPayments((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );

  const handleClose = () => {
    onOpenChange(false);
  };

  // ================== RENDER DIALOG ==================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Calculadora de impuestos / financiación</DialogTitle>
          <DialogDescription>
            Simulá el total en ARS según cotización, métodos de pago y cuotas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Subtotal en USD */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Subtotal en USD</label>
            <Input
              type="number"
              value={subtotalUSD}
              onChange={(e) => setSubtotalUSD(e.target.value)}
              placeholder="Ej: 800"
            />
          </div>

          {/* ========== PASO 3: PAGO (ADAPTADO) ========== */}
          <div className="space-y-4">
            <h3 className="font-medium">Métodos de Pago</h3>

            {payments.map((p, i) => (
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
                      const chosen = paymentMethods.find(
                        (m) => String(m.id) === val
                      );

                      updatePaymentField(i, "payment_method_id", val);
                      updatePaymentField(i, "method_name", chosen?.name || "");
                      updatePaymentField(
                        i,
                        "method",
                        chosen?.name?.toLowerCase() || ""
                      );
                      updatePaymentField(i, "installments", "");
                      updatePaymentField(
                        i,
                        "multiplier",
                        chosen?.multiplier || 1
                      );
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Método de pago..." />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {getInstallmentsForMethod(p.payment_method_id).length > 0 && (
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
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Cuotas" />
                      </SelectTrigger>
                      <SelectContent>
                        {getInstallmentsForMethod(
                          p.payment_method_id
                        ).map((inst) => (
                          <SelectItem
                            key={inst.id}
                            value={inst.installments.toString()}
                          >
                            {inst.installments} cuotas
                          </SelectItem>
                        ))}
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
                  <Input
                    className="w-full"
                    placeholder="Monto (ARS)"
                    type="number"
                    value={p.amount}
                    onChange={(e) =>
                      updatePaymentField(i, "amount", e.target.value)
                    }
                  />

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
            ))}

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
                {subtotalUSDNumber.toFixed(2)} USD
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
                return (
                  <div key={i} className="col-span-2 flex justify-between">
                    <div className="text-muted-foreground">
                      {p.method_name || "Método"}:
                    </div>
                    <div className="text-right">{formatARS(amount)}</div>
                  </div>
                );
              })}

              <div className="text-muted-foreground font-medium border-t mt-2 pt-2">
                Total Final ARS:
              </div>
              <div className="text-right font-bold text-primary border-t mt-2 pt-2">
                {formatARS(totalWithSurcharge)}
              </div>

              <div className="text-muted-foreground">Pagado:</div>
              <div
                className={`text-right font-semibold ${
                  Math.round(paidARS) === Math.round(totalWithSurcharge)
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {formatARS(paidARS)}
              </div>

              <div className="text-muted-foreground">Restante:</div>
              <div
                className={`text-right font-bold ${
                  remaining === 0 ? "text-green-600" : "text-blue-600"
                }`}
              >
                {formatARS(remaining)}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={handleClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
