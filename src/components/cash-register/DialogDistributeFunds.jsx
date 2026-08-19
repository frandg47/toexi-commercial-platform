import { useState, useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { IconPlus, IconTrash } from "@tabler/icons-react";

const CURRENCIES = ["ARS", "USD", "USDT"];

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n || 0);
const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);
const formatUSDT = (n) =>
  `USDT ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`;
const formatCurrency = (amount, currency) => {
  if (currency === "USD") return formatUSD(amount);
  if (currency === "USDT") return formatUSDT(amount);
  return formatARS(amount);
};

export default function DialogDistributeFunds({ open, onOpenChange, movements, onConfirm, loading }) {
  const [allAccounts, setAllAccounts] = useState([]);
  const [distributions, setDistributions] = useState([]);

  useEffect(() => {
    if (!open) return;
    const fetchAccounts = async () => {
      const { data } = await supabase
        .from("accounts")
        .select("id, name, currency, is_reference_capital")
        .eq("is_reference_capital", false)
        .order("name", { ascending: true });
      setAllAccounts(data || []);
    };
    fetchAccounts();
    setDistributions([]);
  }, [open]);

  const balance = useMemo(() => {
    if (!movements?.length) return { ARS: 0, USD: 0, USDT: 0 };
    return movements.reduce(
      (acc, m) => {
        const currency = m.currency || "ARS";
        if (!acc[currency]) acc[currency] = 0;
        if (["opening", "income", "transfer_in"].includes(m.type)) {
          acc[currency] += Number(m.amount || 0);
        }
        if (["expense", "withdrawal", "transfer_out"].includes(m.type)) {
          acc[currency] -= Number(m.amount || 0);
        }
        return acc;
      },
      { ARS: 0, USD: 0, USDT: 0 }
    );
  }, [movements]);

  const activeCurrencies = CURRENCIES.filter((c) => Math.abs(balance[c] || 0) > 0.009);

  const distributedTotals = useMemo(() => {
    const totals = { ARS: 0, USD: 0, USDT: 0 };
    distributions.forEach((d) => {
      const currency = d.currency || "ARS";
      totals[currency] += Number(d.amount || 0);
    });
    return totals;
  }, [distributions]);

  const remainingPerCurrency = useMemo(() => {
    const remaining = {};
    activeCurrencies.forEach((c) => {
      remaining[c] = balance[c] - distributedTotals[c];
    });
    return remaining;
  }, [balance, distributedTotals, activeCurrencies]);

  const allBalanced = activeCurrencies.every((c) => Math.abs(remainingPerCurrency[c] || 0) <= 0.01);

  const addDistribution = () => {
    const defaultCurrency = activeCurrencies[0] || "ARS";
    setDistributions((prev) => [...prev, { account_id: "", amount: 0, currency: defaultCurrency }]);
  };

  const removeDistribution = (index) => {
    setDistributions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDistribution = (index, field, value) => {
    setDistributions((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  };

  const accountsForCurrency = (currency) =>
    allAccounts.filter((a) => a.currency === currency);

  const handleConfirm = async () => {
    if (distributions.length === 0) {
      toast.error("Agregá al menos una distribución");
      return;
    }

    if (!allBalanced) {
      toast.error("El total distribuido por moneda debe coincidir con el saldo disponible");
      return;
    }

    const invalid = distributions.find((d) => !d.account_id || d.amount <= 0);
    if (invalid) {
      toast.error("Completá todas las cuentas y montos");
      return;
    }

    const result = await onConfirm(distributions);
    if (result?.ok) {
      toast.success("Fondos distribuidos correctamente");
      onOpenChange(false);
    } else {
      toast.error(result?.error || "No se pudieron distribuir los fondos");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Distribuir Fondos</DialogTitle>
          <DialogDescription>
            Asigná el saldo de la caja a las diferentes cuentas del sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Saldo por moneda */}
          {activeCurrencies.length > 0 && (
            <div className={`grid gap-3 text-center ${activeCurrencies.length === 1 ? "grid-cols-1" : activeCurrencies.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {activeCurrencies.map((c) => (
                <div key={c} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Saldo a distribuir ({c})</p>
                  <p className={`text-lg font-semibold ${balance[c] >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(balance[c], c)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Distribuciones */}
          <div className="space-y-3">
            {distributions.map((dist, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="w-28 space-y-1">
                    {idx === 0 && <Label className="text-xs text-muted-foreground">Moneda</Label>}
                    <Select
                      value={dist.currency}
                      onValueChange={(val) => updateDistribution(idx, "currency", val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCurrencies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    {idx === 0 && <Label className="text-xs text-muted-foreground">Cuenta</Label>}
                    <Select
                      value={dist.account_id}
                      onValueChange={(val) => updateDistribution(idx, "account_id", val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsForCurrency(dist.currency).map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 space-y-1">
                    {idx === 0 && <Label className="text-xs text-muted-foreground">Monto</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={dist.amount || ""}
                      onChange={(e) => updateDistribution(idx, "amount", Number(e.target.value))}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-red-500 hover:text-red-600"
                    onClick={() => removeDistribution(idx)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addDistribution}>
            <IconPlus className="h-4 w-4 mr-1" />
            Agregar cuenta
          </Button>

          {/* Estado por moneda */}
          {distributions.length > 0 && (
            <div className="space-y-2">
              {activeCurrencies.map((c) => {
                const rem = remainingPerCurrency[c];
                const isBalanced = Math.abs(rem || 0) <= 0.01;
                return (
                  <div
                    key={c}
                    className={`rounded-lg border p-2 text-center text-sm ${
                      isBalanced
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {c}: {isBalanced ? "Distribuido completo" : `Restante: ${formatCurrency(rem, c)}`}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || distributions.length === 0}>
            {loading ? "Distribuyendo..." : "Distribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
