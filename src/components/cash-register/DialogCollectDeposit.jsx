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
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

export default function DialogCollectDeposit({
  open,
  onOpenChange,
  deposit,
  onConfirm,
  loading,
  virtualAccounts = [],
  allAccounts = [],
}) {
  const [methods, setMethods] = useState([]);
  const [methodId, setMethodId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data } = await supabase
        .from("payment_methods")
        .select("id, name, account_id, accounts(id, name, currency)")
        .eq("is_active", true)
        .order("name");
      setMethods(data || []);
    };
    load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMethodId("");
    setDestinationAccountId("");
    setReference("");
  }, [open, deposit]);

  const selectedMethod = useMemo(
    () => methods.find((method) => String(method.id) === String(methodId)),
    [methods, methodId]
  );
  const isTransfer = selectedMethod?.name?.toLowerCase() === "transferencia";
  const displayAccounts = isTransfer ? virtualAccounts : allAccounts;

  const formatCurrency = (amount, currency = "ARS") => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : currency === "USDT" ? "USD" : "ARS",
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const handleConfirm = async () => {
    if (!methodId) {
      toast.error("Seleccioná un método de pago");
      return;
    }
    if (isTransfer && !destinationAccountId) {
      toast.error("Seleccioná la cuenta destino");
      return;
    }

    setSaving(true);
    const accountId = isTransfer
      ? Number(destinationAccountId)
      : Number(selectedMethod?.account_id) || null;

    const { error } = await onConfirm({
      payment_method_id: Number(methodId),
      account_id: accountId,
      reference: reference || null,
    });

    setSaving(false);

    if (error) {
      toast.error(error || "No se pudo cobrar la seña");
      return;
    }

    toast.success("Seña cobrada y registrada en caja");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar Seña</DialogTitle>
          <DialogDescription>
            Seleccioná el método de pago para registrar el cobro en la caja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">
              {deposit?.leads?.customers?.name || "Sin cliente"}{" "}
              {deposit?.leads?.customers?.last_name || ""}
            </p>
            <p className="text-muted-foreground">Pedido #{deposit?.lead_id}</p>
            <p className="text-sm font-medium mt-1">
              {formatCurrency(deposit?.amount_ars, deposit?.currency)}
              {deposit?.currency !== "ARS" && deposit?.amount && (
                <span className="text-muted-foreground ml-1">
                  ({deposit.currency} {Number(deposit.amount).toLocaleString("es-AR")})
                </span>
              )}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Método de pago</Label>
            <Select
              value={methodId}
              onValueChange={(value) => {
                setMethodId(value);
                setDestinationAccountId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná un método" />
              </SelectTrigger>
              <SelectContent>
                {methods.map((method) => (
                  <SelectItem key={method.id} value={String(method.id)}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMethod && (
            <div className="grid gap-2">
              <Label>{isTransfer ? "Cuenta destino" : "Cuenta de acreditación"}</Label>
              {isTransfer ? (
                <Select
                  value={destinationAccountId}
                  onValueChange={setDestinationAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná una cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {virtualAccounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name} ({account.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-md border px-3 py-2 text-sm">
                  {selectedMethod.accounts?.name || "Sin configurar"}
                </p>
              )}
            </div>
          )}

          <Input
            placeholder="Referencia / autorización (opcional)"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || loading}>
            {saving ? "Cobrando..." : "Confirmar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
