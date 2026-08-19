import { useState, useEffect } from "react";
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
import { IconCash, IconCurrencyDollar } from "@tabler/icons-react";
import { toast } from "sonner";

const CURRENCIES = [
  { code: "ARS", label: "Pesos", placeholder: "0" },
  { code: "USD", label: "Dólares", placeholder: "0" },
  { code: "USDT", label: "USDT", placeholder: "0" },
];

const formatCurrency = (amount, currency = "ARS") => {
  const currencies = {
    ARS: { style: "currency", currency: "ARS" },
    USD: { style: "currency", currency: "USD" },
    USDT: { style: "currency", currency: "USD" },
  };
  return new Intl.NumberFormat("es-AR", currencies[currency] || currencies.ARS).format(
    amount || 0
  );
};

export default function DialogOpenCashRegister({
  open,
  onOpenChange,
  onConfirm,
  loading,
  efectivoAccounts = [],
  virtualAccounts = [],
}) {
  const [counted, setCounted] = useState({
    ARS: "",
    USD: "",
    USDT: "",
  });

  useEffect(() => {
    if (!open) return;
    const defaults = { ARS: "", USD: "", USDT: "" };
    for (const acc of efectivoAccounts) {
      const code = acc.currency;
      if (Object.prototype.hasOwnProperty.call(defaults, code)) {
        defaults[code] = String(acc.current_balance || 0);
      }
    }
    setCounted(defaults);
  }, [open, efectivoAccounts, virtualAccounts]);

  const handleCountedChange = (currency, value) => {
    setCounted((prev) => ({ ...prev, [currency]: value }));
  };

  const getAccountBalance = (currencyCode) => {
    const acc = efectivoAccounts.find((a) => a.currency === currencyCode);
    return acc?.current_balance || 0;
  };

  const getAccountName = (currencyCode) => {
    const acc = efectivoAccounts.find((a) => a.currency === currencyCode);
    return acc?.name || null;
  };

  const handleConfirm = async () => {
    const parsedAmounts = CURRENCIES.map((c) => ({
      currency: c.code,
      amount: Number(counted[c.code] || 0),
    }));

    const hasAnyAmount = parsedAmounts.some((a) => a.amount > 0);
    if (!hasAnyAmount) {
      toast.error("Ingresá al menos un monto inicial");
      return;
    }

    const adjustments = differences
      .filter((d) => d.hasDiff)
      .map((d) => {
        const account = efectivoAccounts.find((acc) => acc.currency === d.currency);
        return account
          ? {
              account_id: account.id,
              currency: d.currency,
              counted: d.counted,
            }
          : null;
      })
      .filter(Boolean);

    if (hasAnyDifference && adjustments.length !== differences.filter((d) => d.hasDiff).length) {
      toast.error("No hay una cuenta de efectivo configurada para cada moneda con diferencia");
      return;
    }

    const result = await onConfirm(parsedAmounts, adjustments);
    if (result?.ok) {
      toast.success("Caja abierta correctamente");
      setCounted({ ARS: "", USD: "", USDT: "" });
      onOpenChange(false);
    } else {
      toast.error(result?.error || "No se pudo abrir la caja");
    }
  };

  const hasAnyAmount = CURRENCIES.some((c) => Number(counted[c.code] || 0) > 0);
  const hasActiveCurrency = CURRENCIES.some((c) => {
    const acc = efectivoAccounts.find((a) => a.currency === c.code);
    return acc && acc.current_balance > 0;
  });

  // Calcular diferencias para warning consolidado
  const differences = CURRENCIES.map((c) => {
    const countedAmount = Number(counted[c.code] || 0);
    const balance = getAccountBalance(c.code);
    const hasCounted = countedAmount > 0;
    const hasBalance = balance > 0;
    const diff = {
      currency: c.code,
      counted: countedAmount,
      balance,
      hasDiff: (hasCounted || hasBalance) && Math.abs(countedAmount - balance) > 0.01,
    };
    return diff;
  });
  const hasAnyDifference = differences.some((d) => d.hasDiff);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconCash className="h-5 w-5 text-primary" />
            Abrir Caja Diaria
          </DialogTitle>
          <DialogDescription>
            Ingresá el efectivo que contás físicamente. El saldo real de la cuenta se muestra como referencia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Efectivo */}
          <div className="rounded-lg border p-3 space-y-3">
            <h4 className="font-medium text-sm">Efectivo físico</h4>

            {CURRENCIES.map((currency) => {
              const accountBalance = getAccountBalance(currency.code);
              const accountName = getAccountName(currency.code);
              const countedValue = Number(counted[currency.code] || 0);
              const diff = countedValue - accountBalance;
              const hasDifference = Math.abs(diff) > 0.009 && (countedValue > 0 || accountBalance > 0);

              if (accountBalance <= 0 && !counted[currency.code]) return null;

              return (
                <div key={currency.code} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      {currency.label} ({currency.code})
                      {accountName && (
                        <span className="ml-1 text-muted-foreground font-normal">
                          — {accountName}
                        </span>
                      )}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Saldo cuenta: {formatCurrency(accountBalance, currency.code)}
                    </span>
                  </div>
                  <Input
                    id={`cash-${currency.code}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Contado (${currency.code})`}
                    value={counted[currency.code]}
                    onChange={(e) => handleCountedChange(currency.code, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirm();
                    }}
                    autoFocus={currency.code === "ARS" && hasActiveCurrency}
                  />
                  {hasDifference && (
                    <p className={`text-xs ${diff > 0 ? "text-green-600" : "text-amber-600"}`}>
                      {diff > 0 ? `Sobrante: +${formatCurrency(diff, currency.code)}` : `Faltante: ${formatCurrency(diff, currency.code)}`}
                    </p>
                  )}
                </div>
              );
            })}

            {!hasActiveCurrency && (
              <p className="text-xs text-muted-foreground">
                No hay cuentas de efectivo configuradas. Ingresá los montos manualmente.
              </p>
            )}
          </div>

          {/* Warning de diferencias */}
          {hasAnyDifference && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <p className="font-medium">⚠️ Diferencia detectada</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {differences
                  .filter((d) => d.hasDiff)
                  .map((d) => (
                    <li key={d.currency}>
                      {d.currency}: Contado {formatCurrency(d.counted, d.currency)} vs
                      Cuenta {formatCurrency(d.balance, d.currency)}
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-amber-600">
                 Esta diferencia se registrará como ajuste de apertura antes de abrir la caja.
              </p>
            </div>
          )}

          {/* Cuentas virtuales (referencia) */}
          {virtualAccounts.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <IconCurrencyDollar className="h-4 w-4 text-blue-500" />
                <h4 className="font-medium text-sm">Cuentas virtuales (referencia)</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {virtualAccounts.map((acc) => (
                  <div key={acc.id} className="text-xs">
                    <span className="text-muted-foreground">{acc.name}: </span>
                    <span className="font-medium">{formatCurrency(acc.current_balance, acc.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !hasAnyAmount}>
            {loading ? "Procesando..." : hasAnyDifference ? "Registrar ajuste y abrir" : "Abrir caja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
