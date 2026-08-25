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
import { IconCoin, IconCash } from "@tabler/icons-react";
import DialogCollectDeposit from "./DialogCollectDeposit";

export default function PendingDepositsSection({ pendingDeposits, onCollect, loading, virtualAccounts = [], allAccounts = [] }) {
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);

  const handleCollectClick = (deposit) => {
    setSelectedDeposit(deposit);
    setCollectDialogOpen(true);
  };

  const handleDialogClose = (open) => {
    setCollectDialogOpen(open);
    if (!open) setSelectedDeposit(null);
  };

  const handleCollectConfirm = async (paymentData) => {
    if (!selectedDeposit) return { ok: false };
    const result = await onCollect(selectedDeposit.id, paymentData);
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

  const hasDeposits = pendingDeposits && pendingDeposits.length > 0;
  const totalPendiente = hasDeposits
    ? pendingDeposits.reduce((sum, d) => sum + Number(d.amount_ars || 0), 0)
    : 0;

  return (
    <>
      {hasDeposits && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <IconCash className="h-4 w-4 text-blue-500" />
                Señas Pendientes de Cobro
                <Badge variant="secondary" className="ml-1">
                  {pendingDeposits.length}
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
                    <TableHead className="w-[12%]">N° Ped.</TableHead>
                    <TableHead className="w-[30%]">Cliente</TableHead>
                    <TableHead className="w-[15%]">Importe</TableHead>
                    <TableHead className="w-[12%] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDeposits.map((deposit) => (
                    <TableRow key={deposit.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTime(deposit.received_at)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        #{String(deposit.lead_id).slice(-4)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm uppercase">
                          {deposit.leads?.customers?.name || "Sin cliente"}
                          {deposit.leads?.customers?.last_name ? ` ${deposit.leads.customers.last_name}` : ""}
                        </p>
                        {deposit.leads?.customers?.phone && (
                          <p className="text-xs text-muted-foreground">
                            {deposit.leads.customers.phone}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <div>{formatCurrency(deposit.amount_ars, deposit.currency)}</div>
                        {deposit.currency !== "ARS" && (
                          <div className="text-xs text-muted-foreground">
                            {deposit.currency} {Number(deposit.amount).toLocaleString("es-AR")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          onClick={() => handleCollectClick(deposit)}
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

      <DialogCollectDeposit
        open={collectDialogOpen}
        onOpenChange={handleDialogClose}
        deposit={selectedDeposit}
        onConfirm={handleCollectConfirm}
        loading={loading}
        virtualAccounts={virtualAccounts}
        allAccounts={allAccounts}
      />
    </>
  );
}
