import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconEye, IconCalendar, IconLockOpen } from "@tabler/icons-react";

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatCurrency = (amount, currency) => {
  if (currency === "USD") return `US$ ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === "USDT") return `USDT ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return formatARS(amount);
};

const formatAmounts = (amounts, fallbackAmount, fallbackCurrency) => {
  if (Array.isArray(amounts) && amounts.length > 0) {
    return amounts.map((item) => formatCurrency(item.amount, item.currency)).join(" · ");
  }
  return fallbackAmount != null ? formatCurrency(fallbackAmount, fallbackCurrency) : "—";
};

const formatDifferences = (items, fallbackAmount, fallbackCurrency) => {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((item) => {
      const difference = Number(item.difference || 0);
      if (Math.abs(difference) < 0.01) return `${item.currency}: Cuadrado`;
      return `${item.currency}: ${difference > 0 ? "Sobrante" : "Faltante"} ${formatCurrency(Math.abs(difference), item.currency)}`;
    }).join(" · ");
  }
  return fallbackAmount != null ? formatCurrency(fallbackAmount, fallbackCurrency) : "—";
};

const statusConfig = {
  open: {
    label: "Abierta",
    className: "border-green-200 bg-green-100 text-green-800",
  },
  closed: {
    label: "Cerrada",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

export default function CashRegisterHistory({
  history,
  loading,
  onViewDetail,
  onCloseRegister,
}) {
  if (loading) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        Cargando historial...
      </div>
    );
  }

  if (!history.length) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        No hay registros de caja.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Apertura</TableHead>
            <TableHead className="text-right">Cierre</TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((reg) => {
            const status = statusConfig[reg.status] || statusConfig.closed;
            const userName = reg.users
              ? [reg.users.name, reg.users.last_name].filter(Boolean).join(" ")
              : "—";

            return (
              <TableRow key={reg.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    <IconCalendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {new Date(reg.register_date + "T12:00:00").toLocaleDateString("es-AR")}
                  </div>
                </TableCell>
                <TableCell>{userName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{reg.currency}</Badge>
                </TableCell>
                <TableCell className="text-right text-xs">
                  {formatAmounts(reg.opening_amounts, reg.opening_amount, reg.currency)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs">
                    {formatAmounts(reg.closed_amounts, reg.closed_amount, reg.currency)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {reg.difference != null || reg.difference_per_currency ? (
                    <span
                      className={
                        reg.difference_per_currency
                          ? reg.difference_per_currency.every((item) => Math.abs(Number(item.difference || 0)) < 0.01)
                          : reg.difference === 0
                          ? "text-green-600 font-medium"
                          : "text-red-600 font-medium"
                      }
                    >
                      {formatDifferences(reg.difference_per_currency, reg.difference, reg.currency)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {reg.status === "open" && onCloseRegister ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mr-2"
                      onClick={() => onCloseRegister(reg)}
                    >
                      <IconLockOpen className="mr-1 h-4 w-4" />
                      Cerrar
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onViewDetail(reg)}
                  >
                    <IconEye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
