import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconBan } from "@tabler/icons-react";

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

const formatCurrency = (amount, currency) => {
  if (currency === "USD") return formatUSD(amount);
  if (currency === "USDT") return formatUSDT(amount);
  return formatARS(amount);
};

const TYPE_LABELS = {
  opening: "Apertura",
  sale_income: "Venta",
  income: "Ingreso",
  expense: "Gasto",
  withdrawal: "Retiro",
  transfer_in: "Transf. entrada",
  transfer_out: "Transf. salida",
  closing: "Cierre",
};

const TYPE_COLORS = {
  opening: "bg-blue-100 text-blue-700",
  sale_income: "bg-green-100 text-green-700",
  income: "bg-green-100 text-green-700",
  expense: "bg-red-100 text-red-700",
  withdrawal: "bg-red-100 text-red-700",
  transfer_in: "bg-emerald-100 text-emerald-700",
  transfer_out: "bg-orange-100 text-orange-700",
  closing: "bg-gray-100 text-gray-700",
};

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function getAccountLabel(m) {
  return m.accounts?.name || m.payment_method_name || "";
}

function InlineView({ movements }) {
  return (
    <div className="space-y-1">
      {movements.map((m) => {
        const isIncome = ["opening", "sale_income", "income", "transfer_in"].includes(m.type);
        const colorClass = TYPE_COLORS[m.type] || "bg-gray-100 text-gray-700";

        return (
          <div
            key={m.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 text-sm"
          >
            <span className="text-xs text-muted-foreground w-12 shrink-0">
              {formatTime(m.created_at)}
            </span>

            <Badge variant="outline" className={`text-[10px] shrink-0 ${colorClass}`}>
              {TYPE_LABELS[m.type] || m.type}
            </Badge>

            <div className="flex-1 min-w-0">
              <span className="text-xs text-muted-foreground truncate block">
                {getAccountLabel(m)}
              </span>
            </div>

            {m.accreditation_status === "pending" && (
              <span className="text-[10px] text-amber-600 shrink-0">
                Acred. {m.available_on || "..."}
              </span>
            )}

            <span
              className={`text-sm font-medium shrink-0 ${
                isIncome ? "text-green-600" : "text-red-600"
              }`}
            >
              {isIncome ? "+" : "\u2212"}
              {formatCurrency(m.net_amount || m.amount, m.currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DialogView({ movements, onVoidSale }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Hora</TableHead>
            <TableHead className="w-24">Tipo</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead className="text-right w-36">Monto</TableHead>
            {onVoidSale && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => {
            const isIncome = ["opening", "sale_income", "income", "transfer_in"].includes(m.type);
            const colorClass = TYPE_COLORS[m.type] || "bg-gray-100 text-gray-700";

            return (
              <TableRow
                key={m.id}
                className={m.accreditation_status === "pending" ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
              >
                <TableCell className="text-xs text-muted-foreground">
                  {formatTime(m.created_at)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
                    {TYPE_LABELS[m.type] || m.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {getAccountLabel(m)}
                  {m.accreditation_status === "pending" && (
                    <span className="block text-[10px] text-amber-600">
                      Acred. {m.available_on || "..."}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                  {m.notes || "—"}
                </TableCell>
                <TableCell
                  className={`text-right text-sm font-medium ${
                    isIncome ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isIncome ? "+" : "\u2212"}
                  {formatCurrency(m.net_amount || m.amount, m.currency)}
                  <span className="text-[10px] text-muted-foreground ml-1">{m.currency || "ARS"}</span>
                </TableCell>
                {onVoidSale && (
                  <TableCell className="text-right">
                    {m.type === "sale_income" && m.related_table === "sales" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-destructive"
                        onClick={() => onVoidSale(m.related_id)}
                      >
                        <IconBan className="h-3.5 w-3.5" />
                        Anular
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CashRegisterMovements({ movements, variant = "inline", onVoidSale }) {
  if (!movements?.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No hay movimientos registrados
      </p>
    );
  }

  if (variant === "dialog") {
    return <DialogView movements={movements} onVoidSale={onVoidSale} />;
  }

  return <InlineView movements={movements} />;
}
