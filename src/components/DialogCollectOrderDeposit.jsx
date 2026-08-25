import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { generateOrderDepositPDF } from "@/utils/generateOrderDepositPDF";

export default function DialogCollectOrderDeposit({
  open,
  onOpenChange,
  lead,
  currentRegister,
  virtualAccounts = [],
  allAccounts = [],
  onSaved,
}) {
  const isOffline = !currentRegister;

  const [methods, setMethods] = useState([]);
  const [currency, setCurrency] = useState("ARS");
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [fxRates, setFxRates] = useState({ USD: null, USDT: null });
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    if (!open || isOffline) return;
    const load = async () => {
      const [{ data: methodData }, { data: rates }] = await Promise.all([
        supabase
          .from("payment_methods")
          .select("id, name, multiplier, account_id, accounts(id, name, currency)")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("fx_rates")
          .select("source, rate")
          .eq("is_active", true)
          .in("source", ["blue", "USDT"]),
      ]);
      setMethods(methodData || []);
      setFxRates({
        USD: Number((rates || []).find((rate) => rate.source === "blue")?.rate || 0) || null,
        USDT: Number((rates || []).find((rate) => rate.source === "USDT")?.rate || 0) || null,
      });
    };
    load();
  }, [open, isOffline]);

  useEffect(() => {
    if (!open) return;
    setCurrency("ARS");
    setMethodId("");
    setAmount("");
    setReference("");
    setNotes("");
    setDestinationAccountId("");
    setReceipt(null);
  }, [open, lead]);

  const selectedMethod = useMemo(
    () => methods.find((method) => String(method.id) === String(methodId)),
    [methods, methodId]
  );
  const isTransfer = selectedMethod?.name?.toLowerCase() === "transferencia";
  const displayAccounts = isTransfer ? virtualAccounts : allAccounts;
  const rate = currency === "ARS" ? 1 : fxRates[currency];
  const amountARS = Number(amount || 0) * (rate || 0);

  const formatAmount = (value, valueCurrency = currency) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: valueCurrency === "USDT" ? "USD" : valueCurrency,
      minimumFractionDigits: 2,
    }).format(Number(value || 0));

  const handleConfirm = async () => {
    if (!lead?.id || Number(amount || 0) <= 0) {
      toast.error("Ingresá el importe de la seña");
      return;
    }
    if (currency !== "ARS" && !rate) {
      toast.error(`No hay cotización activa para ${currency}`);
      return;
    }

    if (!isOffline) {
      if (!methodId) {
        toast.error("Seleccioná un método de pago");
        return;
      }
      if (isTransfer && !destinationAccountId) {
        toast.error("Seleccioná la cuenta destino");
        return;
      }
    }

    setSaving(true);
    const accountId = !isOffline ? (destinationAccountId || selectedMethod?.account_id || null) : null;

    let data, error;

    if (!isOffline) {
      const result = await supabase.rpc("collect_order_deposit", {
        p_lead_id: lead.id,
        p_register_id: currentRegister.id,
        p_payment_method_id: Number(methodId),
        p_amount: Number(amount),
        p_currency: currency,
        p_amount_ars: amountARS,
        p_fx_rate: rate,
        p_reference: reference || null,
        p_account_id: accountId ? Number(accountId) : null,
        p_notes: notes || null,
      });
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase.rpc("register_order_deposit_offline", {
        p_lead_id: lead.id,
        p_amount: Number(amount),
        p_currency: currency,
        p_amount_ars: amountARS,
        p_fx_rate: rate,
      });
      data = result.data;
      error = result.error;
    }

    setSaving(false);

    if (error) {
      toast.error(error.message || "No se pudo registrar la seña");
      return;
    }

    if (!isOffline) {
      const { data: reservedUnit } = lead.reserved_inventory_unit_id
        ? await supabase
            .from("inventory_units")
            .select("identifier_value")
            .eq("id", lead.reserved_inventory_unit_id)
            .maybeSingle()
        : { data: null };
      const account = displayAccounts.find((item) => String(item.id) === String(accountId));
      const nextReceipt = {
        lead,
        amount: Number(amount),
        currency,
        amountARS,
        rate,
        methodName: selectedMethod?.name || "",
        accountName: account?.name || selectedMethod?.accounts?.name || "",
        reference,
        receiptId: data?.deposit_id,
        reservedIdentifier: reservedUnit?.identifier_value || "",
        expiresAt: lead.reservation_expires_at || lead.appointment_datetime,
      };
      setReceipt(nextReceipt);
      toast.success("Seña registrada en caja");
    } else {
      toast.success("Seña registrada. Aparecerá en la caja del dueño para cobrar.");
      window.dispatchEvent(new Event("deposit-created"));
      onOpenChange(false);
    }
    onSaved?.();
  };

  const handleDownload = () => {
    if (receipt) generateOrderDepositPDF(receipt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{receipt ? "Seña registrada" : "Registrar seña"}</DialogTitle>
          <DialogDescription>
            {receipt
              ? isOffline
                ? "La seña quedó registrada. Aparecerá como venta pendiente en la caja del dueño."
                : "El ingreso quedó asociado al pedido y a la caja abierta."
              : isOffline
                ? "La seña quedará como venta pendiente para que el dueño de la caja la cobre."
                : "El cobro se registra directamente en la caja abierta."}
          </DialogDescription>
        </DialogHeader>

        {receipt ? (
          <div className="space-y-3 py-3">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">Pedido #{receipt.lead.id}</p>
              <p>{formatAmount(receipt.amount, receipt.currency)} · {receipt.methodName}</p>
              <p>Cuenta: {receipt.accountName || "Sin cuenta"}</p>
              <p>Equivalente: {formatAmount(receipt.amountARS, "ARS")}</p>
              <p>Vencimiento: {receipt.expiresAt ? new Date(receipt.expiresAt).toLocaleString("es-AR") : "Sin fecha"}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleDownload}>
              Descargar comprobante
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{lead?.customers?.name || "Sin cliente"} {lead?.customers?.last_name || ""}</p>
              <p className="text-muted-foreground">Pedido #{lead?.id}</p>
            </div>
            <div className="grid gap-2">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Importe</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
              {currency !== "ARS" && rate && <p className="text-xs text-muted-foreground">Equivalente: {formatAmount(amountARS, "ARS")}</p>}
            </div>
            {!isOffline && (
              <>
                <div className="grid gap-2">
                  <Label>Método de pago</Label>
                  <Select value={methodId} onValueChange={(value) => { setMethodId(value); setDestinationAccountId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Seleccioná un método" /></SelectTrigger>
                    <SelectContent>{methods.map((method) => <SelectItem key={method.id} value={String(method.id)}>{method.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {selectedMethod && (
                  <div className="grid gap-2">
                    <Label>{isTransfer ? "Cuenta destino" : "Cuenta de acreditación"}</Label>
                    {isTransfer ? (
                      <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                        <SelectTrigger><SelectValue placeholder="Seleccioná una cuenta" /></SelectTrigger>
                        <SelectContent>{virtualAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name} ({account.currency})</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <p className="rounded-md border px-3 py-2 text-sm">{selectedMethod.accounts?.name || "Sin configurar"}</p>
                    )}
                  </div>
                )}
                <Input placeholder="Referencia / autorización (opcional)" value={reference} onChange={(event) => setReference(event.target.value)} />
                <Textarea placeholder="Notas (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cerrar</Button>
          {!receipt && <Button onClick={handleConfirm} disabled={saving}>{saving ? "Registrando..." : "Confirmar seña"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
