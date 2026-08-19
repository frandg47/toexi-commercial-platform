import { useState, useMemo, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { IconDownload } from "@tabler/icons-react";
import { generateCashRegisterPDF } from "@/utils/generateCashRegisterPDF";

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatUSD = (n) =>
  `US$ ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;

const formatUSDT = (n) =>
  `USDT ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;

const formatCurrency = (amount, currency) => {
  if (currency === "USD") return formatUSD(amount);
  if (currency === "USDT") return formatUSDT(amount);
  return formatARS(amount);
};

const CURRENCIES = ["ARS", "USD", "USDT"];

const THRESHOLDS = { ARS: 3000, USD: 5, USDT: 5 };

export default function DialogCloseCashRegister({
  open,
  onOpenChange,
  register,
  movements,
  onConfirm,
  loading,
  exchangeRate,
  usdtRate,
  accountMovements = [],
  onSyncEfectivo,
}) {
  const [countedCash, setCountedCash] = useState({
    ARS: "",
    USD: "",
    USDT: "",
  });
  const [verifiedOperations, setVerifiedOperations] = useState({});
  const [notes, setNotes] = useState("");
  const [closedResult, setClosedResult] = useState(null);

  const balance = useMemo(() => {
    if (!movements?.length) return { ARS: 0, USD: 0, USDT: 0 };
    return movements.reduce(
      (acc, m) => {
        const currency = m.currency || "ARS";
        if (!acc[currency]) acc[currency] = 0;
        if (
          ["opening", "sale_income", "income", "transfer_in"].includes(m.type)
        ) {
          acc[currency] += Number(m.amount || 0);
        }
        if (["expense", "withdrawal", "transfer_out"].includes(m.type)) {
          acc[currency] -= Number(m.amount || 0);
        }
        return acc;
      },
      { ARS: 0, USD: 0, USDT: 0 },
    );
  }, [movements]);

  const categorized = useMemo(() => {
    if (!movements?.length)
      return { cash: { ARS: 0, USD: 0, USDT: 0 }, transfers: [], cards: [] };

    const cash = { ARS: 0, USD: 0, USDT: 0 };
    const transfers = [];
    const cards = [];

    for (const m of movements) {
      const name = (m.payment_method_name || "").toLowerCase();
      const cur = m.currency || "ARS";
      const isExpense = ["expense", "withdrawal", "transfer_out"].includes(
        m.type,
      );
      const amount = isExpense ? -Number(m.amount || 0) : Number(m.amount || 0);
      const isTransfer =
        m.type === "transfer_in" ||
        m.type === "transfer_out" ||
        name.includes("transfer");
      const isCard = name.includes("tarjeta") || name.includes("card");
      const isLinkedCash = m.accounts?.is_efectivo === true;
      const isLegacyUnlinkedCash =
        !m.account_id && !isTransfer && !isCard;
      const isLegacyCashTransferOut = !m.account_id && m.type === "transfer_out";

      if (m.type === "opening") {
        cash[cur] = (cash[cur] || 0) + Number(m.amount || 0);
        continue;
      }

      if (
        ![
          "income",
          "sale_income",
          "transfer_in",
          "expense",
          "withdrawal",
        ].includes(m.type)
      )
        continue;

      if (isLinkedCash || isLegacyUnlinkedCash || isLegacyCashTransferOut) {
        cash[cur] = (cash[cur] || 0) + amount;
      } else if (isTransfer) {
        if (!isExpense) transfers.push(m);
      } else if (isCard) {
        if (!isExpense) cards.push(m);
      } else {
        // Movimientos vinculados a cuentas virtuales no afectan el efectivo.
      }
    }

    return { cash, transfers, cards };
  }, [movements]);

  const activeCurrencies = CURRENCIES.filter(
    (c) =>
      c === "ARS" ||
      Math.abs(balance[c] || 0) > 0.009 ||
      Math.abs(categorized.cash[c] || 0) > 0.009 ||
      countedCash[c] !== "",
  );

  const toARS = useCallback(
    (amount, currency) => {
      if (currency === "ARS") return Number(amount || 0);
      if (currency === "USD") return Number(amount || 0) * (exchangeRate || 0);
      if (currency === "USDT") return Number(amount || 0) * (usdtRate || 0);
      return 0;
    },
    [exchangeRate, usdtRate],
  );

  const cashExpectedARS = useMemo(() => {
    return Object.entries(categorized.cash).reduce(
      (sum, [c, v]) => sum + toARS(v, c),
      0,
    );
  }, [categorized.cash, toARS]);

  const transferExpectedARS = useMemo(() => {
    return categorized.transfers.reduce(
      (sum, m) => sum + toARS(m.amount, m.currency),
      0,
    );
  }, [categorized.transfers, toARS]);

  const transferExpectedByAccount = useMemo(() => {
    const groups = new Map();

    categorized.transfers.forEach((movement) => {
      const currency = movement.currency || "ARS";
      const accountId = movement.account_id || "unlinked";
      const accountName = movement.accounts?.name || "Cuenta sin vincular";
      const key = `${accountId}-${currency}`;
      const current = groups.get(key) || {
        key,
        accountName,
        currency,
        amount: 0,
        amountARS: 0,
      };

      current.amount += Number(movement.amount || 0);
      current.amountARS += toARS(movement.amount, currency);
      groups.set(key, current);
    });

    return [...groups.values()].sort((a, b) =>
      `${a.accountName}-${a.currency}`.localeCompare(
        `${b.accountName}-${b.currency}`,
      ),
    );
  }, [categorized.transfers, toARS]);

  const verificationItems = useMemo(() => {
    const transferItems = categorized.transfers.map((movement) => ({
      id: `transfer-${movement.operation_id || movement.id}`,
      label: movement.notes || `Transferencia #${movement.id}`,
      account: movement.accounts?.name || "Cuenta sin vincular",
      currency: movement.currency || "ARS",
      amount: Number(movement.amount || 0),
      type: movement.type === "sale_income" ? "Venta" : "Transferencia",
      isSale: movement.type === "sale_income",
      createdAt: movement.created_at || "",
      detail: movement.reference ? `Alias: ${movement.reference}` : "",
    }));

    const accountGroups = new Map();
    accountMovements.forEach((movement) => {
      const groupId = movement.operation_id || `legacy-${movement.id}`;
      const current = accountGroups.get(groupId) || {
        id: `account-${groupId}`,
        type: "Movimiento de cuenta",
        rows: [],
        notes: movement.notes || "Movimiento de cuenta",
      };
      current.rows.push(movement);
      accountGroups.set(groupId, current);
    });

    const accountItems = [...accountGroups.values()].map((group) => ({
      ...group,
      label: group.notes,
      isAccountOperation: true,
      accountRows: group.rows.map((movement) => ({
        accountName: movement.accounts?.name || "Cuenta",
        signedAmount:
          movement.type === "income"
            ? Math.abs(Number(movement.amount || 0))
            : -Math.abs(Number(movement.amount || 0)),
        currency: movement.currency || "ARS",
      })),
      createdAt:
        group.rows
          .map((movement) => movement.created_at)
          .filter(Boolean)
          .sort()[0] || "",
      detail: group.rows
        .map((movement) => {
          const accountName = movement.accounts?.name || "Cuenta";
          const sign = movement.type === "income" ? "+" : "−";
          return `${sign}${accountName} ${formatCurrency(movement.amount, movement.currency)}`;
        })
        .join(" → "),
    }));

    const cardItems = categorized.cards.map((movement) => ({
      id: `card-${movement.id}`,
      label: movement.payment_method_name || `Tarjeta #${movement.id}`,
      account: movement.accounts?.name || "Cuenta de tarjeta",
      currency: movement.currency || "ARS",
      amount: Number(movement.net_amount || movement.amount || 0),
      type: "Tarjeta",
      isSale: true,
      createdAt: movement.created_at || "",
      detail:
        movement.accreditation_status === "pending" && movement.available_on
          ? `Acreditación: ${movement.available_on}`
          : "",
    }));

    return [...transferItems, ...accountItems, ...cardItems].sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)),
    );
  }, [accountMovements, categorized.cards, categorized.transfers]);

  const cardExpectedNeto = useMemo(() => {
    return categorized.cards.reduce(
      (sum, m) => sum + toARS(Number(m.net_amount || m.amount), m.currency),
      0,
    );
  }, [categorized.cards, toARS]);

  const totalExpected =
    cashExpectedARS + transferExpectedARS + cardExpectedNeto;

  const allOperationsVerified =
    verificationItems.length === 0 ||
    verificationItems.every((item) => verifiedOperations[item.id]);

  const perCurrencyDiffs = useMemo(() => {
    return CURRENCIES.map((c) => {
      const expected = categorized.cash[c] || 0;
      const counted = Number(countedCash[c] || 0);
      return {
        currency: c,
        expected,
        counted,
        difference: counted - expected,
        exceeds: Math.abs(counted - expected) > THRESHOLDS[c],
      };
    });
  }, [countedCash, categorized.cash]);

  const blockingDiffs = perCurrencyDiffs.filter(
    (d) => d.exceeds && countedCash[d.currency] !== "",
  );

  const canClose =
    Object.values(countedCash).some((v) => v !== "") &&
    allOperationsVerified &&
    blockingDiffs.length === 0;

  const toggleAllOperations = (checked) => {
    setVerifiedOperations(
      checked
        ? Object.fromEntries(verificationItems.map((item) => [item.id, true]))
        : {},
    );
  };

  const handleConfirm = async () => {
    const amounts = activeCurrencies
      .map((c) => ({ currency: c, amount: Number(countedCash[c] || 0) }))
      .filter((a) => a.amount > 0 || countedCash[a.currency] !== "");

    if (amounts.length === 0) {
      toast.error("Ingresá el monto contado en efectivo");
      return;
    }

    if (blockingDiffs.length > 0) {
      toast.error(
        `Diferencia significativa: ${blockingDiffs
          .map(
            (d) => `${d.currency} ${formatCurrency(d.difference, d.currency)}`,
          )
          .join(", ")}. Registrá una operación de ajuste para cuadrar la caja.`,
      );
      return;
    }

    const result = await onConfirm(amounts, notes);
    if (result?.ok) {
      setClosedResult({
        ...result,
        differencePerCurrency:
          result.register?.difference_per_currency || perCurrencyDiffs,
      });
      toast.success("Caja cerrada correctamente");

      if (onSyncEfectivo) {
        const syncResult = await onSyncEfectivo(amounts, register.id);
        if (syncResult?.ok) {
          toast.success("Cuentas de efectivo sincronizadas");
        } else {
          toast.warning(
            "La caja se cerró pero hubo un error sincronizando las cuentas de efectivo",
          );
        }
      }
    } else {
      toast.error(result?.error || "No se pudo cerrar la caja");
    }
  };

  const handleDownloadReceipt = () => {
    if (!register || !closedResult) return;
    const receiptRegister = closedResult.register || register;
    generateCashRegisterPDF({
      register: receiptRegister,
      movements: closedResult.movements || movements,
      balance,
      countedCash,
      differencePerCurrency:
        closedResult.differencePerCurrency || perCurrencyDiffs,
    });
    toast.success("Comprobante descargado");
  };

  const handleClose = () => {
    setCountedCash({ ARS: "", USD: "", USDT: "" });
    setVerifiedOperations({});
    setNotes("");
    setClosedResult(null);
    onOpenChange(false);
  };

  if (!register) return null;

  if (closedResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-600">Caja cerrada</DialogTitle>
            <DialogDescription>
              La caja fue cerrada correctamente. Descargá el comprobante si lo
              necesitás.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="rounded-lg border divide-y">
              {(closedResult.differencePerCurrency || []).map((item) => {
                const amount = Number(item.difference || 0);
                return (
                  <div
                    key={item.currency}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <span className="font-medium">{item.currency}</span>
                    <span
                      className={
                        Math.abs(amount) < 0.01
                          ? "text-green-600 font-medium"
                          : "text-red-600 font-medium"
                      }
                    >
                      {Math.abs(amount) < 0.01
                        ? "Cuadrado"
                        : `${amount > 0 ? "Sobrante" : "Faltante"}: ${formatCurrency(Math.abs(amount), item.currency)}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <Button
              variant="outline"
              onClick={handleDownloadReceipt}
              className="w-full gap-2"
            >
              <IconDownload className="h-4 w-4" />
              Descargar comprobante de cierre
            </Button>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cerrar Caja Diaria</DialogTitle>
          <DialogDescription>
            {register.register_date && (
              <>
                Fecha:{" "}
                {new Date(
                  register.register_date + "T12:00:00",
                ).toLocaleDateString("es-AR")}{" "}
                —{" "}
              </>
            )}
            Contá el efectivo, verificá transferencias y tarjetas, y cerrá la
            caja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ═══════════════ EFECTIVO ═══════════════ */}
          <div className="rounded-lg border p-3 space-y-3">
            <h4 className="font-medium text-sm">Efectivo</h4>

            {activeCurrencies.map((c) => {
                const diff = perCurrencyDiffs.find((d) => d.currency === c);
                return (
                  <div key={c} className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{c}</span>
                      <span>
                        Esperado: {formatCurrency(categorized.cash[c], c)}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={`Contado (${c})`}
                      value={countedCash[c]}
                      onChange={(e) =>
                        setCountedCash((prev) => ({
                          ...prev,
                          [c]: e.target.value,
                        }))
                      }
                      autoFocus={c === activeCurrencies[0]}
                    />
                    {diff &&
                      countedCash[c] !== "" &&
                      Math.abs(diff.difference) > 0.009 && (
                        <p
                          className={`text-xs ${diff.difference > 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {diff.difference > 0
                            ? `Sobrante: +${formatCurrency(diff.difference, c)}`
                            : `Faltante: ${formatCurrency(diff.difference, c)}`}
                        </p>
                      )}
                  </div>
                );
              })}
          </div>

          {verificationItems.length > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-2">
              <span className="text-xs text-muted-foreground">
                {verificationItems.length} operaciones requieren verificación
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllOperations(true)}
                >
                  Tildar todo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleAllOperations(false)}
                >
                  Destildar todo
                </Button>
              </div>
            </div>
          )}

          {/* ═══════════════ OPERACIONES A VERIFICAR ═══════════════ */}
          {verificationItems.length > 0 && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">
                    Operaciones a verificar ({verificationItems.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Ordenadas cronológicamente
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Transferencias equivalentes: {formatARS(transferExpectedARS)}
                </span>
              </div>

              <div className="rounded-md bg-muted/40 p-2 space-y-1">
                <p className="text-xs font-medium">
                  Transferencias esperadas por cuenta destino
                </p>
                {transferExpectedByAccount.map((group) => (
                  <div
                    key={group.key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      {group.accountName} ({group.currency})
                    </span>
                    <span className="font-medium">
                      {formatCurrency(group.amount, group.currency)}
                    </span>
                  </div>
                ))}
              </div>

              {verificationItems.map((item) => {
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 text-sm border-t pt-2"
                  >
                    <Checkbox
                      checked={!!verifiedOperations[item.id]}
                      onCheckedChange={(checked) =>
                        setVerifiedOperations((prev) => ({
                          ...prev,
                          [item.id]: checked,
                        }))
                      }
                    />
                    <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 shrink-0">
                      {item.type}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.label}</p>
                      {item.isAccountOperation ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {item.accountRows.map((row, index) => (
                            <span
                              key={`${item.id}-${index}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <span>{row.accountName}</span>
                              <span className="text-muted-foreground">
                                {row.signedAmount > 0 ? "+" : "−"}
                                {formatCurrency(Math.abs(row.signedAmount), row.currency)}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.account ||
                            item.detail ||
                            "Movimiento de cuenta"}
                          {item.account && item.detail
                            ? ` — ${item.detail}`
                            : ""}
                        </p>
                      )}
                    </div>

                    {!item.isAccountOperation && item.amount !== 0 && (
                      <span
                        className={`font-medium shrink-0 ${
                          item.amount > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {`${item.amount > 0 ? "+" : "−"}${formatCurrency(
                          Math.abs(item.amount),
                          item.currency,
                        )}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══════════════ ALERTA DE DIFERENCIA ═══════════════ */}
          {blockingDiffs.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-medium">
                ⚠️ Diferencia significativa — cierre bloqueado
              </p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {blockingDiffs.map((d) => (
                  <li key={d.currency}>
                    {d.currency}: teórico{" "}
                    {formatCurrency(d.expected, d.currency)} vs físico{" "}
                    {formatCurrency(d.counted, d.currency)}
                    {" — "}
                    <span className="font-medium">
                      {d.difference > 0 ? "sobrante" : "faltante"}{" "}
                      {formatCurrency(Math.abs(d.difference), d.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Registrá una operación de ajuste (ingreso o egreso) para cuadrar
                la caja antes de cerrar.
              </p>
            </div>
          )}

          {/* ═══════════════ RESUMEN ═══════════════ */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efectivo esperado:</span>
              <div className="text-right font-medium">
                {CURRENCIES.filter(
                  (currency) =>
                    Math.abs(categorized.cash[currency] || 0) > 0.009,
                ).map((currency) => (
                  <div key={currency}>
                    {formatCurrency(categorized.cash[currency], currency)}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Transferencias equivalentes ARS:
              </span>
              <span className="font-medium">
                {formatARS(transferExpectedARS)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tarjetas (neto):</span>
              <span className="font-medium">{formatARS(cardExpectedNeto)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <span>Total esperado equivalente ARS:</span>
              <span>{formatARS(totalExpected)}</span>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="close-notes">Notas (opcional)</Label>
            <Textarea
              id="close-notes"
              placeholder="Observaciones del cierre..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !canClose}>
            {loading ? "Cerrando..." : "Cerrar caja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
