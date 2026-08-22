import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";

const MOVEMENT_TYPE_LABELS = {
  opening: { label: "Apertura", className: "border-blue-200 bg-blue-100 text-blue-800" },
  sale_income: { label: "Venta", className: "border-green-200 bg-green-100 text-green-800" },
  income: { label: "Ingreso", className: "border-green-200 bg-green-100 text-green-800" },
  expense: { label: "Gasto", className: "border-red-200 bg-red-100 text-red-800" },
  withdrawal: { label: "Retiro", className: "border-orange-200 bg-orange-100 text-orange-800" },
  transfer_in: { label: "Transferencia entrada", className: "border-cyan-200 bg-cyan-100 text-cyan-800" },
  transfer_out: { label: "Transferencia salida", className: "border-amber-200 bg-amber-100 text-amber-800" },
  closing: { label: "Cierre", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

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

export default function CashRegisterDetail({ register, open, onOpenChange }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !register?.id) return;
    setLoading(true);
    const fetchMovements = async () => {
      const { data } = await supabase
        .from("cash_register_movements")
        .select("*, accounts!cash_register_movements_account_id_fkey(name, currency, is_efectivo, is_caja_virtual)")
        .eq("cash_register_id", register.id)
        .order("created_at", { ascending: true });
      setMovements(data || []);
      setLoading(false);
    };
    fetchMovements();
  }, [open, register?.id]);

  if (!register) return null;

  const userName = register.users
    ? [register.users.name, register.users.last_name].filter(Boolean).join(" ")
    : "—";

  const openingByCur = new Map();
  const closedByCur = new Map();

  (register.opening_amounts || []).forEach((a) =>
    openingByCur.set(a.currency, Number(a.amount || 0))
  );
  (register.closed_amounts || []).forEach((a) =>
    closedByCur.set(a.currency, Number(a.amount || 0))
  );

  if (register.opening_amount != null && !openingByCur.has(register.currency)) {
    openingByCur.set(register.currency, Number(register.opening_amount || 0));
  }
  if (register.closed_amount != null && !closedByCur.has(register.currency)) {
    closedByCur.set(register.currency, Number(register.closed_amount || 0));
  }

  const currencies = [...new Set([...openingByCur.keys(), ...closedByCur.keys()])];
  const persistedDifferences = Array.isArray(register.difference_per_currency)
    ? register.difference_per_currency
    : [];
  const differenceByCurrency = new Map(
    persistedDifferences.map((item) => [item.currency, item])
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de Caja</DialogTitle>
          <DialogDescription>
            {new Date(register.register_date + "T12:00:00").toLocaleDateString("es-AR")} — {userName} — {register.currency}
          </DialogDescription>
        </DialogHeader>

        {/* Resumen por moneda */}
        <div className="rounded-md border divide-y">
          {currencies.map((currency) => {
            const opening = openingByCur.get(currency);
            const closed = closedByCur.get(currency);
            const persisted = differenceByCurrency.get(currency);
            const difference = persisted?.difference;

            return (
              <div key={currency} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{currency}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {register.currency === currency ? "Moneda principal" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span>
                    Apertura: <span className="font-medium">{opening != null ? formatCurrency(opening, currency) : "—"}</span>
                  </span>
                  <span>
                    Cierre: <span className="font-medium">{closed != null ? formatCurrency(closed, currency) : "—"}</span>
                  </span>
                  {persisted ? (
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        Teórico {formatCurrency(persisted.expected, currency)}
                      </span>
                      <span className={difference === 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {difference === 0
                          ? "Cuadrado"
                          : `${difference > 0 ? "Sobrante" : "Faltante"} ${formatCurrency(Math.abs(difference), currency)}`}
                      </span>
                    </span>
                  ) : opening != null && closed != null ? (
                    <span className="text-muted-foreground text-xs">
                      Diferencia no disponible
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Movimientos */}
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">Cargando movimientos...</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Hora</TableHead>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right w-32">Monto</TableHead>
                  <TableHead className="max-w-[200px]">Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const typeInfo = MOVEMENT_TYPE_LABELS[m.type] || { label: m.type, className: "" };
                  const isIncome = ["opening", "sale_income", "income", "transfer_in"].includes(m.type);
                  const accountName = m.accounts?.name || m.payment_method_name || "Caja";

                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeInfo.className}>
                          {typeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{accountName}</span>
                        {m.accreditation_status === "pending" && (
                          <span className="block text-[10px] text-amber-600">
                            Acred. {m.available_on || "..."}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${isIncome ? "text-green-600" : "text-red-600"}`}>
                        {isIncome ? "+" : "−"}{formatCurrency(m.amount, m.currency)}
                        <span className="text-[10px] text-muted-foreground ml-1">{m.currency || "ARS"}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {m.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No hay movimientos registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
