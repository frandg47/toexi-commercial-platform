import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { IconEdit } from "@tabler/icons-react";

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

export default function AccountsConfig() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [fxRate, setFxRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [movements, setMovements] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    initial_balance: "",
    currency: "ARS",
    include_in_balance: true,
    is_reference_capital: false,
  });
  const [form, setForm] = useState({
    name: "",
    initial_balance: "",
    currency: "ARS",
    notes: "",
    include_in_balance: true,
    is_reference_capital: false,
  });
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_account_id: "",
    to_account_id: "",
    amount: "",
    rate_mode: "system",
    manual_fx_rate: "",
  });

  const loadAccounts = async () => {
    const [{ data, error }, { data: rate }, { data: usdt }, movementsResponse] =
      await Promise.all([
        supabase
          .from("accounts")
          .select(
            "id, name, currency, initial_balance, notes, include_in_balance, is_reference_capital"
          )
          .order("name", { ascending: true }),
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
          .from("account_movements")
          .select("id, account_id, type, amount"),
      ]);

    if (error) {
      toast.error("No se pudieron cargar las cuentas", {
        description: error.message,
      });
      return;
    }

    setAccounts(data || []);
    setFxRate(rate?.rate ? Number(rate.rate) : null);
    setUsdtRate(usdt?.rate ? Number(usdt.rate) : null);
    if (movementsResponse?.error) {
      toast.error("No se pudieron cargar movimientos", {
        description: movementsResponse.error.message,
      });
      setMovements([]);
    } else {
      setMovements(movementsResponse?.data || []);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const startEdit = (account) => {
    setEditId(account.id);
    setEditForm({
      name: account.name || "",
      initial_balance: String(account.initial_balance ?? ""),
      currency: account.currency || "ARS",
      include_in_balance: account.include_in_balance ?? true,
      is_reference_capital: account.is_reference_capital ?? false,
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditForm({
      name: "",
      initial_balance: "",
      currency: "ARS",
      include_in_balance: true,
      is_reference_capital: false,
    });
  };

  const handleUpdateAccount = async () => {
    const name = editForm.name.trim();
    const initialBalance = Number(editForm.initial_balance || 0);

    if (!name) return toast.error("Ingresa un nombre de cuenta");
    if (Number.isNaN(initialBalance))
      return toast.error("Monto inicial invalido");

    setLoading(true);
    const { error } = await supabase
      .from("accounts")
      .update({
        name,
        initial_balance: initialBalance,
        currency: editForm.currency,
        include_in_balance: editForm.include_in_balance,
        is_reference_capital: editForm.is_reference_capital,
      })
      .eq("id", editId);

    if (error) {
      setLoading(false);
      toast.error("No se pudo actualizar la cuenta", {
        description: error.message,
      });
      return;
    }

    toast.success("Cuenta actualizada");
    await loadAccounts();
    setLoading(false);
    cancelEdit();
  };

  const handleCreateAccount = async () => {
    const name = form.name.trim();
    const initialBalance = Number(form.initial_balance || 0);

    if (!name) return toast.error("Ingresa un nombre de cuenta");
    if (Number.isNaN(initialBalance))
      return toast.error("Monto inicial invalido");

    setLoading(true);
    const { error } = await supabase.from("accounts").insert([
      {
        name,
        initial_balance: initialBalance,
        currency: form.currency,
        notes: form.notes || null,
        include_in_balance: form.include_in_balance,
        is_reference_capital: form.is_reference_capital,
      },
    ]);

    if (error) {
      setLoading(false);
      toast.error("No se pudo crear la cuenta", { description: error.message });
      return;
    }

    toast.success("Cuenta creada");
    setForm({
      name: "",
      initial_balance: "",
      currency: "ARS",
      notes: "",
      include_in_balance: true,
      is_reference_capital: false,
    });
    await loadAccounts();
    setLoading(false);
  };

  const fromAccount = useMemo(
    () =>
      accounts.find(
        (acc) => String(acc.id) === String(transferForm.from_account_id)
      ),
    [accounts, transferForm.from_account_id]
  );
  const toAccount = useMemo(
    () =>
      accounts.find(
        (acc) => String(acc.id) === String(transferForm.to_account_id)
      ),
    [accounts, transferForm.to_account_id]
  );

  const getRateForCurrency = (currency) => {
    if (currency === "ARS") return 1;
    if (currency === "USD") return fxRate;
    if (currency === "USDT") return usdtRate;
    return null;
  };

  const resolveManualRate = (fromCurrency, toCurrency, manualRate) => {
    const safeManualRate = Number(manualRate || 0);
    if (!safeManualRate) return null;

    if (fromCurrency === "USD" && toCurrency === "ARS") return safeManualRate;
    if (fromCurrency === "USDT" && toCurrency === "ARS") return safeManualRate;
    if (fromCurrency === "ARS" && toCurrency === "USD") return 1 / safeManualRate;
    if (fromCurrency === "ARS" && toCurrency === "USDT") return 1 / safeManualRate;

    return null;
  };

  const accountBalances = useMemo(() => {
    const totals = new Map();
    movements.forEach((movement) => {
      const entry = totals.get(movement.account_id) || {
        income: 0,
        expense: 0,
      };
      if (movement.type === "income") {
        entry.income += Number(movement.amount || 0);
      } else if (movement.type === "expense") {
        entry.expense += Number(movement.amount || 0);
      }
      totals.set(movement.account_id, entry);
    });

    return accounts.map((acc) => {
      const totalsForAccount = totals.get(acc.id) || {
        income: 0,
        expense: 0,
      };
      const current =
        Number(acc.initial_balance || 0) +
        totalsForAccount.income -
        totalsForAccount.expense;
      return {
        ...acc,
        current_balance: current,
      };
    });
  }, [accounts, movements]);

  const balanceByAccountId = useMemo(() => {
    return new Map(accountBalances.map((acc) => [acc.id, acc.current_balance]));
  }, [accountBalances]);

  const transferAmount = Number(transferForm.amount || 0);
  const isSameAccount =
    fromAccount &&
    toAccount &&
    String(fromAccount.id) === String(toAccount.id);
  const availableFromBalance = fromAccount
    ? balanceByAccountId.get(fromAccount.id) ?? 0
    : 0;
  const canConvert =
    fromAccount &&
    toAccount &&
    fromAccount.currency !== toAccount.currency &&
    ((transferForm.rate_mode === "system" &&
      getRateForCurrency(fromAccount.currency) &&
      getRateForCurrency(toAccount.currency)) ||
      (transferForm.rate_mode === "manual" &&
        resolveManualRate(
          fromAccount.currency,
          toAccount.currency,
          transferForm.manual_fx_rate
        )));

  const manualRateLabel =
    fromAccount && toAccount
      ? `1 ${fromAccount.currency} = ? ${toAccount.currency}`
      : "Cotizacion manual";

  const manualConvertedAmount =
    fromAccount &&
    toAccount &&
    fromAccount.currency !== toAccount.currency &&
    transferForm.rate_mode === "manual"
      ? transferAmount *
        Number(
          resolveManualRate(
            fromAccount.currency,
            toAccount.currency,
            transferForm.manual_fx_rate
          ) || 0
        )
      : null;

  const convertedAmount = canConvert
    ? transferForm.rate_mode === "manual"
      ? manualConvertedAmount
      : (transferAmount * getRateForCurrency(fromAccount.currency)) /
        getRateForCurrency(toAccount.currency)
    : null;

  const handleCreateTransfer = async () => {
    if (!fromAccount || !toAccount) {
      toast.error("Selecciona cuentas de origen y destino");
      return;
    }
    if (fromAccount.id === toAccount.id) {
      toast.error("La cuenta de origen y destino no pueden ser la misma");
      return;
    }
    if (!transferAmount || Number.isNaN(transferAmount) || transferAmount <= 0) {
      toast.error("Ingresa un monto valido");
      return;
    }
    if (transferAmount > availableFromBalance) {
      toast.error("Saldo insuficiente");
      return;
    }

    let amountInARS = transferAmount;
    let amountTo = transferAmount;
    let fromFxUsed = null;
    let toFxUsed = null;

    if (fromAccount.currency !== toAccount.currency) {
      if (transferForm.rate_mode === "manual") {
        const manualRate = resolveManualRate(
          fromAccount.currency,
          toAccount.currency,
          transferForm.manual_fx_rate
        );

        if (!manualRate) {
          toast.error("Ingresa una cotizacion manual valida");
          return;
        }

        amountTo = transferAmount * manualRate;

        if (fromAccount.currency === "ARS") {
          amountInARS = transferAmount;
          toFxUsed = amountTo ? amountInARS / amountTo : null;
        } else if (toAccount.currency === "ARS") {
          amountInARS = amountTo;
          fromFxUsed = transferAmount ? amountInARS / transferAmount : null;
        } else {
          toast.error("La cotizacion manual solo aplica si una cuenta es ARS");
          return;
        }
      } else {
        const fromRate = getRateForCurrency(fromAccount.currency);
        const toRate = getRateForCurrency(toAccount.currency);
        if (!fromRate || !toRate) {
          toast.error("No hay cotizacion activa para la moneda seleccionada");
          return;
        }

        amountInARS = transferAmount * fromRate;
        amountTo = amountInARS / toRate;
        fromFxUsed = fromAccount.currency === "ARS" ? null : fromRate;
        toFxUsed = toAccount.currency === "ARS" ? null : toRate;
      }
    }

    setLoading(true);
    const { error } = await supabase.from("account_movements").insert([
      {
        movement_date: new Date().toISOString().slice(0, 10),
        account_id: fromAccount.id,
        type: "expense",
        amount: transferAmount,
        currency: fromAccount.currency,
        amount_ars: amountInARS,
        fx_rate_used: fromFxUsed,
        related_table: "account_transfer",
        notes: `Transferencia a ${toAccount.name}`,
      },
      {
        movement_date: new Date().toISOString().slice(0, 10),
        account_id: toAccount.id,
        type: "income",
        amount: amountTo,
        currency: toAccount.currency,
        amount_ars: amountInARS,
        fx_rate_used: toFxUsed,
        related_table: "account_transfer",
        notes: `Transferencia desde ${fromAccount.name}`,
      },
    ]);

    if (error) {
      setLoading(false);
      toast.error("No se pudo registrar la transferencia", {
        description: error.message,
      });
      return;
    }

    toast.success("Transferencia registrada");
    setLoading(false);
    setConfirmTransferOpen(false);
    setTransferOpen(false);
    setTransferForm({
      from_account_id: "",
      to_account_id: "",
      amount: "",
      rate_mode: "system",
      manual_fx_rate: "",
    });
    await loadAccounts();
  };

  return (
    <Card className="@container/main flex flex-1 flex-col gap-4 py-6 mt-6">
      <CardHeader>
        <CardTitle>Cuentas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Monto inicial"
            value={form.initial_balance}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                initial_balance: e.target.value,
              }))
            }
          />
          <Select
            value={form.currency}
            onValueChange={(value) => setForm((f) => ({ ...f, currency: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Moneda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="USDT">USDT</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.include_in_balance}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, include_in_balance: checked }))
              }
            />
            <span className="text-sm">Incluir en balance</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_reference_capital}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, is_reference_capital: checked }))
              }
            />
            <span className="text-sm">Cuenta de referencia de capital</span>
          </div>
        </div>
        <Textarea
          placeholder="Notas"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCreateAccount} disabled={loading}>
            Crear cuenta
          </Button>
          <Button
            variant="outline"
            onClick={() => setTransferOpen(true)}
            disabled={loading}
          >
            Nueva transferencia
          </Button>
        </div>

        <Tabs defaultValue="regular">
          <TabsList>
            <TabsTrigger value="regular">Cuentas</TabsTrigger>
            <TabsTrigger value="investment">Inversiones</TabsTrigger>
          </TabsList>
          {["regular", "investment"].map((tab) => {
            const isInvestment = tab === "investment";
            const filtered = accountBalances.filter(
              (acc) => acc.is_reference_capital === isInvestment
            );
            return (
              <TabsContent key={tab} value={tab}>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Moneda</TableHead>
                        <TableHead>Saldo inicial</TableHead>
                        <TableHead>Saldo actual</TableHead>
                        <TableHead>Saldo disponible</TableHead>
                        <TableHead>Incluir</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((acc) => (
                        <TableRow key={acc.id}>
                          <TableCell>
                            {editId === acc.id ? (
                              <Input
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, name: e.target.value }))
                                }
                              />
                            ) : (
                              acc.name
                            )}
                          </TableCell>
                          <TableCell>
                            {editId === acc.id ? (
                              <Select
                                value={editForm.currency}
                                onValueChange={(value) =>
                                  setEditForm((f) => ({ ...f, currency: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Moneda" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ARS">ARS</SelectItem>
                                  <SelectItem value="USD">USD</SelectItem>
                                  <SelectItem value="USDT">USDT</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              acc.currency
                            )}
                          </TableCell>
                          <TableCell>
                            {editId === acc.id ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editForm.initial_balance}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    initial_balance: e.target.value,
                                  }))
                                }
                              />
                            ) : acc.currency === "USD" ? (
                              formatUSD(acc.initial_balance)
                            ) : acc.currency === "USDT" ? (
                              formatUSDT(acc.initial_balance)
                            ) : (
                              formatARS(acc.initial_balance)
                            )}
                          </TableCell>
                          <TableCell>
                            {acc.currency === "USD"
                              ? formatUSD(acc.current_balance)
                              : acc.currency === "USDT"
                                ? formatUSDT(acc.current_balance)
                                : formatARS(acc.current_balance)}
                          </TableCell>
                          <TableCell>
                            {acc.currency === "USD"
                              ? formatUSD(acc.current_balance)
                              : acc.currency === "USDT"
                                ? formatUSDT(acc.current_balance)
                                : formatARS(acc.current_balance)}
                          </TableCell>
                          <TableCell>
                            {editId === acc.id ? (
                              <Switch
                                checked={editForm.include_in_balance}
                                onCheckedChange={(checked) =>
                                  setEditForm((f) => ({ ...f, include_in_balance: checked }))
                                }
                              />
                            ) : acc.include_in_balance ? (
                              "Si"
                            ) : (
                              "No"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editId === acc.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={handleUpdateAccount}
                                  disabled={loading}
                                >
                                  Guardar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEdit}
                                  disabled={loading}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => startEdit(acc)}>
                                <IconEdit className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground"
                          >
                            {isInvestment
                              ? "No hay cuentas de inversiones."
                              : "No hay cuentas creadas."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="w-[90vw] sm:max-w-lg max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Nueva transferencia</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Cuenta origen</span>
              <Select
                value={transferForm.from_account_id}
                onValueChange={(value) =>
                  setTransferForm((f) => ({ ...f, from_account_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cuenta origen" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.name} ({acc.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Cuenta destino</span>
              <Select
                value={transferForm.to_account_id}
                onValueChange={(value) =>
                  setTransferForm((f) => ({ ...f, to_account_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cuenta destino" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.name} ({acc.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Monto</span>
              <Input
                type="number"
                step="0.01"
                value={transferForm.amount}
                onChange={(e) =>
                  setTransferForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            {fromAccount &&
              toAccount &&
              fromAccount.currency !== toAccount.currency && (
                <>
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">
                      Tipo de cotizacion
                    </span>
                    <Select
                      value={transferForm.rate_mode}
                      onValueChange={(value) =>
                        setTransferForm((f) => ({
                          ...f,
                          rate_mode: value,
                          manual_fx_rate:
                            value === "manual" ? f.manual_fx_rate : "",
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
                  {transferForm.rate_mode === "manual" && (
                    <div className="grid gap-1">
                      <span className="text-xs text-muted-foreground">
                        {manualRateLabel}
                      </span>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder="0.0000"
                        value={transferForm.manual_fx_rate}
                        onChange={(e) =>
                          setTransferForm((f) => ({
                            ...f,
                            manual_fx_rate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </>
              )}
            {fromAccount && (
              <div className="text-xs text-muted-foreground">
                Disponible:{" "}
                {fromAccount.currency === "USDT"
                  ? formatUSDT(availableFromBalance)
                  : fromAccount.currency === "USD"
                    ? formatUSD(availableFromBalance)
                    : formatARS(availableFromBalance)}
              </div>
            )}
            {isSameAccount && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                La cuenta origen y destino no pueden ser la misma.
              </div>
            )}
            {fromAccount && transferAmount > availableFromBalance && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                Saldo insuficiente
              </div>
            )}
            {fromAccount &&
              toAccount &&
              fromAccount.currency !== toAccount.currency && (
                <div className="rounded-md border p-3 text-sm">
                  {canConvert ? (
                    <div>
                      Se acreditaran{" "}
                      <strong>
                        {toAccount.currency === "USDT"
                          ? formatUSDT(convertedAmount)
                          : toAccount.currency === "USD"
                            ? formatUSD(convertedAmount)
                            : formatARS(convertedAmount)}
                      </strong>{" "}
                      en la cuenta destino.
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      {transferForm.rate_mode === "manual"
                        ? "Ingresa una cotizacion manual valida para convertir."
                        : "No hay cotizacion activa para convertir."}
                    </div>
                  )}
                </div>
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmTransferOpen(true)}
              disabled={
                loading ||
                !fromAccount ||
                !toAccount ||
                isSameAccount ||
                transferAmount <= 0 ||
                transferAmount > availableFromBalance
              }
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmTransferOpen}
        onOpenChange={setConfirmTransferOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar transferencia</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a transferir{" "}
              <strong>
                {fromAccount?.currency === "USDT"
                  ? formatUSDT(transferAmount)
                  : fromAccount?.currency === "USD"
                    ? formatUSD(transferAmount)
                    : formatARS(transferAmount)}
              </strong>{" "}
              desde <strong>{fromAccount?.name || "-"}</strong> hacia{" "}
              <strong>{toAccount?.name || "-"}</strong>.
              {fromAccount &&
              toAccount &&
              fromAccount.currency !== toAccount.currency &&
              transferForm.rate_mode === "manual" ? (
                <>
                  {" "}
                  Se utilizara una cotizacion manual de{" "}
                  <strong>{transferForm.manual_fx_rate || "-"}</strong>.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateTransfer}
              disabled={
                loading ||
                !fromAccount ||
                !toAccount ||
                isSameAccount ||
                transferAmount <= 0 ||
                transferAmount > availableFromBalance
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
