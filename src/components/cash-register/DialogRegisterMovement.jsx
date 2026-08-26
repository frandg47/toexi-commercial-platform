import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const MOVEMENT_TYPES = [
  { value: "withdrawal", label: "Retiro", description: "Dinero que sale del sistema caja" },
  { value: "income", label: "Ingreso", description: "Dinero que entra al sistema caja" },
  { value: "deposit", label: "Depósito", description: "Caja → cuenta externa" },
  { value: "transfer", label: "Transferencia", description: "Entre cuentas caja (misma moneda)" },
  { value: "exchange", label: "Cambio de moneda", description: "Entre cuentas caja (distinta moneda)" },
];

const formatCurrency = (amount, currency = "ARS") => {
  const opts = {
    ARS: { style: "currency", currency: "ARS" },
    USD: { style: "currency", currency: "USD" },
    USDT: { style: "currency", currency: "USD" },
  };
  return new Intl.NumberFormat("es-AR", opts[currency] || opts.ARS).format(amount || 0);
};

export default function DialogRegisterMovement({
  open,
  onOpenChange,
  onConfirm,
  loading,
  cajaAccounts = [],
  externalAccounts = [],
  registerId,
  fxRate = null,
  usdtRate = null,
  onReload = null,
}) {
  const [type, setType] = useState("withdrawal");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [rateMode, setRateMode] = useState("system");
  const [manualRate, setManualRate] = useState("");

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setType("withdrawal");
      setAmount("");
      setNotes("");
      setAccountId("");
      setDestinationAccountId("");
      setRateMode("system");
      setManualRate("");
    }
  }, [open]);

  const selectedAccount = useMemo(
    () => cajaAccounts.find((a) => String(a.id) === String(accountId)),
    [cajaAccounts, accountId]
  );

  const selectedDestination = useMemo(
    () => {
      if (type === "deposit") {
        return externalAccounts.find((a) => String(a.id) === String(destinationAccountId));
      }
      return cajaAccounts.find((a) => String(a.id) === String(destinationAccountId));
    },
    [type, cajaAccounts, externalAccounts, destinationAccountId]
  );

  const getRealBalance = useCallback((account) => {
    if (!account) return 0;
    return Number(account.current_balance || 0);
  }, []);

  // Filter accounts based on operation type
  const sourceAccounts = useMemo(() => {
    // For all operations, source is always a caja account
    return cajaAccounts;
  }, [cajaAccounts]);

  const destinationAccounts = useMemo(() => {
    if (type === "deposit") {
      // Deposit: destination is external accounts only
      return externalAccounts;
    }
    if (type === "transfer" || type === "exchange") {
      // Transfer/Exchange: destination is caja accounts (excluding source)
      return cajaAccounts.filter((a) => String(a.id) !== String(accountId));
    }
    return [];
  }, [type, cajaAccounts, externalAccounts, accountId]);

  // Get rate for currency
  const getRate = (currency) => {
    if (currency === "ARS") return 1;
    if (currency === "USD") return fxRate;
    if (currency === "USDT") return usdtRate;
    return null;
  };

  // Calculate exchange rate
  const exchangeRate = useMemo(() => {
    if (type !== "exchange") return null;
    if (!selectedAccount || !selectedDestination) return null;

    const fromCurrency = selectedAccount.currency;
    const toCurrency = selectedDestination.currency;

    if (fromCurrency === toCurrency) return 1;

    if (rateMode === "manual") {
      const manual = Number(manualRate || 0);
      if (manual <= 0) return null;
      if (fromCurrency === "USD" || fromCurrency === "USDT") return manual;
      if (toCurrency === "USD" || toCurrency === "USDT") return 1 / manual;
      return manual;
    }

    // System rate
    const fromRate = getRate(fromCurrency);
    const toRate = getRate(toCurrency);
    if (!fromRate || !toRate) return null;
    return fromRate / toRate;
  }, [type, selectedAccount, selectedDestination, rateMode, manualRate, getRate]);

  // Calculate converted amount for exchange
  const convertedAmount = useMemo(() => {
    if (type !== "exchange" || !exchangeRate) return null;
    const parsed = Number(amount || 0);
    if (parsed <= 0) return null;
    return parsed * exchangeRate;
  }, [type, amount, exchangeRate]);

  // Check same currency for transfer
  const isSameCurrency = useMemo(() => {
    if (type !== "transfer") return true;
    if (!selectedAccount || !selectedDestination) return false;
    return selectedAccount.currency === selectedDestination.currency;
  }, [type, selectedAccount, selectedDestination]);

  // Check sufficient balance
  const hasInsufficientBalance = useMemo(() => {
    if (!selectedAccount || !amount) return false;
    const parsed = Number(amount || 0);
    const balance = getRealBalance(selectedAccount);
    return parsed > balance;
  }, [selectedAccount, amount, getRealBalance]);

  const handleConfirm = async () => {
    const parsed = Number(amount || 0);
    const operationId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    if (!parsed || parsed <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }

    if (!accountId) {
      toast.error("Seleccioná una cuenta origen");
      return;
    }

    // Validate based on type
    if (type === "withdrawal" || type === "income") {
      const result = await onConfirm(
        type === "withdrawal" ? "expense" : "income",
        parsed,
        selectedAccount.currency,
        notes || null,
        accountId,
        operationId
      );
      if (result?.ok) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from("account_movements").insert({
          movement_date: today,
          account_id: Number(accountId),
          type: type === "withdrawal" ? "expense" : "income",
          amount: parsed,
          currency: selectedAccount.currency,
          related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: notes || (type === "withdrawal" ? "Retiro desde caja" : "Ingreso a caja"),
        });
        onReload?.();
        toast.success(type === "withdrawal" ? "Retiro registrado" : "Ingreso registrado");
        onOpenChange(false);
      } else {
        toast.error(result?.error || "No se pudo registrar el movimiento");
      }
      return;
    }

    if (type === "deposit") {
      if (!destinationAccountId) {
        toast.error("Seleccioná la cuenta destino");
        return;
      }

      // Create cash register movement (expense from caja)
      const result = await onConfirm(
        "expense",
        parsed,
        selectedAccount.currency,
        notes || `Depósito a ${selectedDestination?.name}`,
        accountId,
        operationId
      );
      if (!result?.ok) {
        toast.error(result?.error || "No se pudo registrar el depósito");
        return;
      }

      // Create account movement (income to external)
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("account_movements").insert([
        {
          movement_date: today,
          account_id: Number(accountId),
          type: "expense",
          amount: parsed,
          currency: selectedAccount.currency,
          related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: notes || `Depósito a ${selectedDestination?.name}`,
        },
        {
          movement_date: today,
          account_id: Number(destinationAccountId),
          type: "income",
          amount: parsed,
          currency: selectedAccount.currency,
          related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: notes || `Depósito desde caja`,
        },
      ]);

      if (error) {
        toast.error("Depósito registrado en caja, pero falló el registro en la cuenta", {
          description: error.message,
        });
      } else {
        onReload?.();
        toast.success("Depósito registrado");
      }
      onOpenChange(false);
      return;
    }

    if (type === "transfer") {
      if (!destinationAccountId) {
        toast.error("Seleccioná la cuenta destino");
        return;
      }
      if (!isSameCurrency) {
        toast.error("Las cuentas deben ser de la misma moneda");
        return;
      }

      // Create two movements: transfer_out + transfer_in
      const noteText = notes || `Transferencia: ${selectedAccount?.name} → ${selectedDestination?.name}`;
       const r1 = await onConfirm("transfer_out", parsed, selectedAccount.currency, noteText, accountId, operationId);
      if (!r1?.ok) {
        toast.error(r1?.error || "No se pudo registrar la transferencia");
        return;
      }
       const r2 = await onConfirm("transfer_in", parsed, selectedAccount.currency, noteText, destinationAccountId, operationId);
      if (r2?.ok) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from("account_movements").insert([
          {
            movement_date: today,
            account_id: Number(accountId),
            type: "expense",
            amount: parsed,
            currency: selectedAccount.currency,
            related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: noteText,
          },
          {
            movement_date: today,
            account_id: Number(destinationAccountId),
            type: "income",
            amount: parsed,
            currency: selectedAccount.currency,
            related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: noteText,
          },
        ]);
        onReload?.();
        toast.success("Transferencia registrada");
        onOpenChange(false);
      } else {
        toast.error(r2?.error || "No se pudo registrar la transferencia");
      }
      return;
    }

    if (type === "exchange") {
      if (!destinationAccountId) {
        toast.error("Seleccioná la cuenta destino");
        return;
      }
      if (!exchangeRate) {
        toast.error("No hay cotización disponible");
        return;
      }
      if (!convertedAmount || convertedAmount <= 0) {
        toast.error("El monto convertido debe ser mayor a 0");
        return;
      }

      // Create two movements: transfer_out (source currency) + transfer_in (dest currency)
      const noteText = notes || `Cambio: ${parsed} ${selectedAccount.currency} → ${convertedAmount.toFixed(2)} ${selectedDestination.currency}`;
       const r1 = await onConfirm("transfer_out", parsed, selectedAccount.currency, noteText, accountId, operationId);
      if (!r1?.ok) {
        toast.error(r1?.error || "No se pudo registrar el cambio");
        return;
      }
       const r2 = await onConfirm("transfer_in", convertedAmount, selectedDestination.currency, noteText, destinationAccountId, operationId);
      if (r2?.ok) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from("account_movements").insert([
          {
            movement_date: today,
            account_id: Number(accountId),
            type: "expense",
            amount: parsed,
            currency: selectedAccount.currency,
            related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: noteText,
          },
          {
            movement_date: today,
            account_id: Number(destinationAccountId),
            type: "income",
            amount: convertedAmount,
            currency: selectedDestination.currency,
            related_table: "cash_register",
           related_id: registerId,
           operation_id: operationId,
           notes: noteText,
          },
        ]);
        onReload?.();
        toast.success("Cambio registrado");
        onOpenChange(false);
      } else {
        toast.error(r2?.error || "No se pudo registrar el cambio");
      }
      return;
    }
  };

  const canConfirm = (() => {
    if (loading) return false;
    if (!accountId || !amount) return false;
    const parsed = Number(amount || 0);
    if (parsed <= 0) return false;

    if (type === "deposit") return !!destinationAccountId;
    if (type === "transfer") return !!destinationAccountId && isSameCurrency;
    if (type === "exchange") return !!destinationAccountId && !!exchangeRate;
    return true;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Movimiento</DialogTitle>
          <DialogDescription>
            Retiro, ingreso, depósito, transferencia o cambio de moneda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Tipo de operación</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((mt) => (
                  <SelectItem key={mt.value} value={mt.value}>
                    <div>
                      <div className="font-medium">{mt.label}</div>
                      <div className="text-xs text-muted-foreground">{mt.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source account (always shown) */}
          <div className="space-y-2">
            <Label>
              {type === "deposit" ? "Cuenta origen (caja)" :
               type === "transfer" || type === "exchange" ? "Cuenta origen" :
               "Cuenta"}
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={String(acc.id)}>
                    {acc.name} ({acc.currency}) — {formatCurrency(getRealBalance(acc), acc.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination account (for deposit, transfer, exchange) */}
          {(type === "deposit" || type === "transfer" || type === "exchange") && (
            <div className="space-y-2">
              <Label>
                {type === "deposit" ? "Cuenta destino (externa)" : "Cuenta destino"}
              </Label>
              <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {destinationAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.name} ({acc.currency})
                      {type !== "deposit" && ` — ${formatCurrency(getRealBalance(acc) || 0, acc.currency)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="movement-amount">
              Monto {selectedAccount ? `(${selectedAccount.currency})` : ""}
            </Label>
            <Input
              id="movement-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {/* Balance info */}
          {selectedAccount && (
            <div className="text-xs text-muted-foreground">
              Disponible: {formatCurrency(getRealBalance(selectedAccount) || 0, selectedAccount.currency)}
            </div>
          )}

          {/* Insufficient balance warning */}
          {hasInsufficientBalance && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              Saldo insuficiente en {selectedAccount?.name}
            </div>
          )}

          {/* Same currency warning for transfer */}
          {type === "transfer" && !isSameCurrency && selectedAccount && selectedDestination && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              Las cuentas deben ser de la misma moneda ({selectedAccount.currency} ≠ {selectedDestination.currency})
            </div>
          )}

          {/* Exchange rate section */}
          {type === "exchange" && selectedAccount && selectedDestination && (
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Cotización</p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={rateMode} onValueChange={setRateMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
                {rateMode === "manual" && (
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="Cotización"
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                  />
                )}
              </div>
              {exchangeRate && (
                <div className="text-xs text-muted-foreground">
                  {rateMode === "manual"
                    ? `1 USD = ${manualRate} ARS (tasa ingresada)`
                    : `1 ${selectedAccount.currency} = ${exchangeRate.toFixed(4)} ${selectedDestination.currency}`}
                </div>
              )}
              {convertedAmount !== null && (
                <div className="rounded-md border p-2 text-sm">
                  Se acreditarán <strong>{formatCurrency(convertedAmount, selectedDestination.currency)}</strong> en{" "}
                  {selectedDestination?.name}
                </div>
              )}
              {rateMode === "system" && !exchangeRate && (
                <div className="text-xs text-amber-600">
                  No hay cotización del sistema disponible
                </div>
              )}
            </div>
          )}

          {/* Info box */}
          {type === "withdrawal" && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
              ℹ️ El dinero sale del sistema caja sin destino rastreado.
            </div>
          )}
          {type === "income" && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
              ℹ️ El dinero entra al sistema caja sin origen rastreado.
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="movement-notes">Notas (opcional)</Label>
            <Textarea
              id="movement-notes"
              placeholder="Descripción del movimiento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {loading ? "Registrando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
