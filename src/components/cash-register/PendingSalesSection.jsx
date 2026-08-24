import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconShoppingCart, IconCoin } from "@tabler/icons-react";
import DialogCollectSale from "./DialogCollectSale";

export default function PendingSalesSection({ pendingSales, onCollect, loading, exchangeRate, usdtRate, virtualAccounts = [], cajaAccounts = [] }) {
  const [selectedSale, setSelectedSale] = useState(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);

  const handleCollectClick = (sale) => {
    setSelectedSale(sale);
    setCollectDialogOpen(true);
  };

  const handleDialogClose = (open) => {
    setCollectDialogOpen(open);
    if (!open) setSelectedSale(null);
  };

  const handleCollectConfirm = async (paymentData) => {
    if (!selectedSale) return { ok: false };
    const result = await onCollect(selectedSale.id, paymentData);
    return result;
  };

  const formatCurrency = (amount, currency = "ARS") => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : currency === "USDT" ? "USD" : "ARS",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTypeLabel = (sale) => {
    if (sale.sale_type === "canje") return "Canje";
    if (sale.sale_type === "warranty") return "Garantía";
    const currency = sale.currency || "ARS";
    if (currency === "USD") return "Compra USD";
    if (currency === "USDT") return "Compra USDT";
    return "Venta";
  };

  const getTypeBadgeClass = (sale) => {
    if (sale.sale_type === "canje") return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800";
    if (sale.sale_type === "warranty") return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800";
    return "";
  };

  const getTradeInCredit = (sale) => {
    if (!sale) return 0;
    if (sale.sale_type === "canje" && sale.trade_in_data) {
      return Number(sale.trade_in_data.amount_ars || 0);
    }
    if (sale.sale_type === "warranty" && sale.trade_in_data) {
      return Number(sale.trade_in_data.amount_ars || 0);
    }
    return 0;
  };

  const hasSales = pendingSales && pendingSales.length > 0;
  const totalPendiente = hasSales
    ? pendingSales.reduce((sum, s) => sum + Number(s.total_ars || s.total || 0), 0)
    : 0;

  return (
    <>
      {hasSales && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <IconShoppingCart className="h-4 w-4 text-orange-500" />
                Ventas Pendientes de Cobro
                <Badge variant="secondary" className="ml-1">
                  {pendingSales.length}
                </Badge>
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                Total: {formatCurrency(totalPendiente)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[12%]">Hora</TableHead>
                    <TableHead className="w-[12%]">N° Op.</TableHead>
                    <TableHead className="w-[25%]">Cliente</TableHead>
                    <TableHead className="w-[12%]">Tipo</TableHead>
                    <TableHead className="w-[15%]">Cant. prod.</TableHead>
                    <TableHead className="w-[12%]">Importe</TableHead>
                    <TableHead className="w-[12%] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTime(sale.sale_date || sale.created_at)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        #{String(sale.id).slice(-4)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm uppercase">
                          {(sale.customers?.name || "Sin cliente")}
                          {sale.customers?.last_name ? ` ${sale.customers.last_name}` : ""}
                        </p>
                        {sale.customers?.phone && (
                          <p className="text-xs text-muted-foreground">
                            {sale.customers.phone}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${getTypeBadgeClass(sale)}`}>
                          {getTypeLabel(sale)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sale.sale_items?.length || 0}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <div>{formatCurrency(sale.total_ars || sale.total, sale.currency || "ARS")}</div>
                        {(sale.sale_type === "canje" || sale.sale_type === "warranty") && getTradeInCredit(sale) > 0 && (
                          <div className="text-xs text-green-600">
                            {sale.sale_type === "canje" ? "Canje" : "Garantía"}: -{formatCurrency(getTradeInCredit(sale))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          onClick={() => handleCollectClick(sale)}
                          disabled={loading}
                          className="gap-1 h-8"
                        >
                          <IconCoin className="h-3.5 w-3.5" />
                          Cobrar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <DialogCollectSale
        open={collectDialogOpen}
        onOpenChange={handleDialogClose}
        sale={selectedSale}
        onConfirm={handleCollectConfirm}
        loading={loading}
        exchangeRate={exchangeRate}
        usdtRate={usdtRate}
        tradeInCredit={getTradeInCredit(selectedSale)}
        virtualAccounts={virtualAccounts}
        cajaAccounts={cajaAccounts}
      />
    </>
  );
}
