import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContextProvider";
import { useCashRegister } from "@/hooks/useCashRegister";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  IconCash,
  IconArrowRight,
  IconArrowsRightLeft,
  IconCurrencyDollar,
  IconEye,
  IconTrendingUp,
  IconTrendingDown,
} from "@tabler/icons-react";
import { toast } from "sonner";

import CashRegisterStatus from "@/components/cash-register/CashRegisterStatus";
import CashRegisterMovements from "@/components/cash-register/CashRegisterMovements";
import DialogOpenCashRegister from "@/components/cash-register/DialogOpenCashRegister";
import DialogCloseCashRegister from "@/components/cash-register/DialogCloseCashRegister";
import DialogRegisterMovement from "@/components/cash-register/DialogRegisterMovement";
import PendingSalesSection from "@/components/cash-register/PendingSalesSection";

const formatCurrency = (amount, currency = "ARS") => {
  const currencies = {
    ARS: { style: "currency", currency: "ARS" },
    USD: { style: "currency", currency: "USD" },
    USDT: { style: "currency", currency: "USD" },
  };
  return new Intl.NumberFormat(
    "es-AR",
    currencies[currency] || currencies.ARS,
  ).format(amount || 0);
};

const calcPercentChange = (current, previous) => {
  if (!previous || !current) return null;
  return ((current - previous) / previous) * 100;
};

const formatRateDate = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function CashRegisterPage() {
  const { user, profile } = useAuth();
  // console.log("profile", user);
  const userId = user?.id;

  const {
    currentRegister,
    isOpen,
    staleOpenRegister,
    otherUserOpenRegister,
    movements,
    pendingSales,
    history,
    loading,
    efectivoAccounts,
    allAccounts,
    virtualAccounts,
    accountMovements,
    checkOpenRegister,
    openRegister,
    closeRegister,
    closeStaleRegister,
    registerMovement,
    collectPendingSale,
    payoutPendingSale,
    loadHistory,
    loadEfectivoAccounts,
    loadVirtualAccounts,
    loadAllAccounts,
    getBalance,
  } = useCashRegister(userId);

  // Dialog states
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [exchangeRatePrev, setExchangeRatePrev] = useState(null);
  const [usdtRatePrev, setUsdtRatePrev] = useState(null);
  const [exchangeRateDate, setExchangeRateDate] = useState(null);
  const [usdtRateDate, setUsdtRateDate] = useState(null);
  const [movementsDialogOpen, setMovementsDialogOpen] = useState(false);
  const [staleDialogOpen, setStaleDialogOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [voidSaleOpen, setVoidSaleOpen] = useState(false);
  const [voidSaleId, setVoidSaleId] = useState(null);
  const [voidSaleReason, setVoidSaleReason] = useState("");
  const [voidSaleBucket, setVoidSaleBucket] = useState("available");
  const [voidSaleLoading, setVoidSaleLoading] = useState(false);

  // Load on mount
  useEffect(() => {
    if (userId) {
      checkOpenRegister();
      loadHistory();
    }
  }, [userId, checkOpenRegister, loadHistory]);

  // Auto-open stale register dialog when detected and no current open register
  useEffect(() => {
    if (staleOpenRegister && !isOpen) {
      setStaleDialogOpen(true);
      toast.warning(
        `Tenés una caja abierta del ${staleOpenRegister.register_date} que debe cerrarse primero.`,
      );
    }
  }, [staleOpenRegister, isOpen]);

  // Show toast when another user has an open register
  useEffect(() => {
    if (otherUserOpenRegister && !isOpen) {
      const email = otherUserOpenRegister.users?.email || "otro usuario";
      toast.warning(
        `Ya hay una caja abierta por ${email}. Solo puede haber una caja abierta a la vez.`,
      );
    }
  }, [otherUserOpenRegister, isOpen]);

  // Fetch FX rates + previous rates for % change
  useEffect(() => {
    const fetchRates = async () => {
      const { data } = await supabase
        .from("fx_rates")
        .select("source, rate, is_active, created_at")
        .in("source", ["blue", "USDT"])
        .order("created_at", { ascending: false });

      const rates = data || [];
      // Active rates
      const blueActive = rates.find(
        (r) => r.source?.toLowerCase() === "blue" && r.is_active,
      );
      const usdtActive = rates.find(
        (r) => r.source?.toUpperCase() === "USDT" && r.is_active,
      );
      // Previous rates (first inactive for each source)
      const bluePrev = rates.find(
        (r) => r.source?.toLowerCase() === "blue" && !r.is_active,
      );
      const usdtPrev = rates.find(
        (r) => r.source?.toUpperCase() === "USDT" && !r.is_active,
      );

      setExchangeRate(blueActive?.rate ? Number(blueActive.rate) : null);
      setUsdtRate(usdtActive?.rate ? Number(usdtActive.rate) : null);
      setExchangeRatePrev(bluePrev?.rate ? Number(bluePrev.rate) : null);
      setUsdtRatePrev(usdtPrev?.rate ? Number(usdtPrev.rate) : null);
      setExchangeRateDate(blueActive?.created_at || null);
      setUsdtRateDate(usdtActive?.created_at || null);
    };
    fetchRates();
  }, []);

  // Clock tick for "en turno" calculation
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const balance = getBalance();

  // Time since register opened
  const timeSinceOpen = useMemo(() => {
    if (!isOpen || !currentRegister?.opened_at) return null;
    const opened = new Date(currentRegister.opened_at);
    const diffMs = now - opened;
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }, [isOpen, currentRegister?.opened_at, now]);

  const latestClosedRegister = useMemo(
    () => history.find((register) => register.status === "closed") || null,
    [history],
  );

  const handleOpenRegister = async (openingAmounts, adjustments) => {
    const result = await openRegister(openingAmounts, adjustments);
    if (result?.ok) {
      await loadHistory();
    }
    return result;
  };

  const handleCloseRegister = async (countedCash, notes) => {
    const result = await closeRegister(countedCash, notes);
    if (result?.ok) {
      await loadHistory();
    }
    return result;
  };

  const handleCloseStaleRegister = async (countedCash, notes) => {
    const result = await closeStaleRegister(countedCash, notes);
    if (result?.ok) {
      await loadHistory();
      setStaleDialogOpen(false);
    }
    return result;
  };

  const handleRegisterMovement = async (
    type,
    amount,
    currency,
    notes,
    accountId,
    operationId,
  ) => {
    const result = await registerMovement(
      type,
      amount,
      currency,
      notes,
      null,
      null,
      accountId,
      operationId,
    );
    if (result?.ok) {
      await loadHistory();
    }
    return result;
  };

  const handleCollectPendingSale = async (saleId, paymentData) => {
    let result;
    if (paymentData.isPayout) {
      result = await payoutPendingSale(saleId, paymentData);
    } else {
      result = await collectPendingSale(saleId, paymentData);
    }
    if (result?.ok) {
      await loadHistory();
    }
    return result;
  };

  const openVoidSale = (saleId) => {
    setVoidSaleId(saleId);
    setVoidSaleReason("");
    setVoidSaleBucket("available");
    setVoidSaleOpen(true);
  };

  const handleVoidSale = async () => {
    if (!voidSaleId || !voidSaleReason.trim()) {
      toast.error("Ingresá el motivo de la anulación");
      return;
    }

    setVoidSaleLoading(true);
    try {
      const { error } = await supabase.rpc("void_sale", {
        p_sale_id: voidSaleId,
        p_reason: voidSaleReason.trim(),
        p_bucket: voidSaleBucket,
        p_delete_canje_unit: false,
      });
      if (error) throw error;

      toast.success("Venta anulada correctamente");
      setVoidSaleOpen(false);
      setVoidSaleId(null);
      await checkOpenRegister();
      await loadEfectivoAccounts();
      await loadVirtualAccounts();
    } catch (error) {
      toast.error("No se pudo anular la venta", { description: error.message });
    } finally {
      setVoidSaleLoading(false);
    }
  };

  const handleSyncEfectivo = async (countedAmounts, registerId = null) => {
    const targetRegisterId = registerId || currentRegister?.id;
    if (!targetRegisterId) return { ok: false, error: "No hay registro" };

    // El conteo físico solo puede ajustar cuentas de efectivo.
    // Las cuentas virtuales se actualizan únicamente con sus operaciones reales.
    const cashAccounts = efectivoAccounts.filter((account) => account.is_efectivo);
    if (cashAccounts.length === 0) return { ok: true };

    const movementsToInsert = [];

    // The account ledger is the source of truth for the physical cash balance.
    for (const acc of cashAccounts) {
      const expectedBalance = Number(acc.current_balance || 0);

      // Get counted amount for this currency
      const counted = countedAmounts.find((a) => a.currency === acc.currency);
      const countedAmount = counted ? Number(counted.amount || 0) : 0;

      // Calculate difference
      const diff = countedAmount - expectedBalance;

      if (Math.abs(diff) < 0.001) continue;

      movementsToInsert.push({
        account_id: acc.id,
        type: diff > 0 ? "income" : "expense",
        amount: Math.abs(diff),
        currency: acc.currency,
        notes: "Sincronización de cierre de caja",
        related_table: "cash_register",
        related_id: targetRegisterId,
      });
    }

    if (movementsToInsert.length === 0) return { ok: true };

    const { error } = await supabase
      .from("account_movements")
      .insert(movementsToInsert);
    if (error) {
      console.error("Error syncing caja accounts:", error);
      return { ok: false, error: error.message };
    }

    // Reload accounts to reflect updated balances
    await loadEfectivoAccounts();
    await loadAllAccounts();

    return { ok: true };
  };

  const userInitials = [profile?.name, profile?.last_name];

  return (
    <div className="flex flex-1 flex-col gap-4 py-6">
      {/* Welcome Banner + Stats */}
      {isOpen && currentRegister && (
        <div className="flex flex-col gap-4 rounded-lg border border-blue-900/20 bg-gradient-to-r from-card to-blue-950/10 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12 border-2 border-primary/20">
              <AvatarImage src={user?.user_metadata.avatar_url} alt={profile?.name} />
              <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Bienvenido/a {profile?.name || ""} {profile?.last_name || ""}
              </h1>
              <p className="text-sm text-muted-foreground">
                Turno activo desde las{" "}
                {new Date(currentRegister.opened_at).toLocaleTimeString(
                  "es-AR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-3">
              <div className="flex flex-col items-center rounded-lg border bg-muted/50 px-4 py-2">
                <span className="text-lg font-bold text-green-600">
                  {movements.length}
                </span>
                <span className="text-xs text-muted-foreground">Ops. hoy</span>
              </div>
              <div className="flex flex-col items-center rounded-lg border bg-muted/50 px-4 py-2">
                <span className="text-lg font-bold text-orange-500">
                  {pendingSales.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  Pendientes
                </span>
              </div>
              {timeSinceOpen && (
                <div className="flex flex-col items-center rounded-lg border bg-muted/50 px-4 py-2">
                  <span className="text-lg font-bold text-blue-600">
                    {timeSinceOpen}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    En turno
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Welcome sin caja */}
      {!isOpen && (
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarImage src={profile?.avatar_url} alt={profile?.name} />
            <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Bienvenido/a {profile?.name || ""} {profile?.last_name || ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              Panel de caja diaria
            </p>
          </div>
        </div>
      )}

      {/* Estado de la caja */}
      <CashRegisterStatus
        register={currentRegister}
        balance={balance}
        disabled={!!otherUserOpenRegister}
        disabledReason={otherUserOpenRegister ? `Caja abierta por ${otherUserOpenRegister.users?.email || "otro usuario"}` : undefined}
        onOpen={() => {
          if (staleOpenRegister) {
            toast.error(
              "Tenés una caja abierta de otro día. Cerrala antes de abrir una nueva.",
            );
            setStaleDialogOpen(true);
            return;
          }
          if (otherUserOpenRegister) {
            const email = otherUserOpenRegister.users?.email || "otro usuario";
            toast.error(
              `Ya hay una caja abierta por ${email}. Solo puede haber una caja abierta a la vez.`,
            );
            return;
          }
          setOpenDialogOpen(true);
        }}
        onClick={() => {
          if (currentRegister?.status === "open") {
            setCloseDialogOpen(true);
          }
        }}
      />

      {/* FX Rates + Movimientos del día */}
      {isOpen && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {/* FX Rates */}
          {exchangeRate && (
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-blue-500" />
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                  <IconCurrencyDollar className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">Dólar Blue</p>
                    {(() => {
                      const pct = calcPercentChange(
                        exchangeRate,
                        exchangeRatePrev,
                      );
                      if (pct === null) return null;
                      return (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5 h-5 px-1.5"
                        >
                          {pct >= 0 ? (
                            <IconTrendingUp className="h-3 w-3 text-green-600" />
                          ) : (
                            <IconTrendingDown className="h-3 w-3 text-red-600" />
                          )}
                          <span
                            className={
                              pct >= 0 ? "text-green-600" : "text-red-600"
                            }
                          >
                            {pct > 0 ? "+" : ""}
                            {pct.toFixed(1)}%
                          </span>
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="text-2xl font-bold">
                    $ {Number(exchangeRate).toLocaleString("es-AR")}
                  </p>
                  {exchangeRateDate && (
                    <p className="text-[10px] text-muted-foreground">
                      Actualizado: {formatRateDate(exchangeRateDate)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {usdtRate && (
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-green-500" />
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                  <IconCurrencyDollar className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">USDT</p>
                    {(() => {
                      const pct = calcPercentChange(usdtRate, usdtRatePrev);
                      if (pct === null) return null;
                      return (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5 h-5 px-1.5"
                        >
                          {pct >= 0 ? (
                            <IconTrendingUp className="h-3 w-3 text-green-600" />
                          ) : (
                            <IconTrendingDown className="h-3 w-3 text-red-600" />
                          )}
                          <span
                            className={
                              pct >= 0 ? "text-green-600" : "text-red-600"
                            }
                          >
                            {pct > 0 ? "+" : ""}
                            {pct.toFixed(1)}%
                          </span>
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="text-2xl font-bold">
                    $ {Number(usdtRate).toLocaleString("es-AR")}
                  </p>
                  {usdtRateDate && (
                    <p className="text-[10px] text-muted-foreground">
                      Actualizado: {formatRateDate(usdtRateDate)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Movimientos del día */}
          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconArrowsRightLeft className="h-4 w-4" />
                  Movimientos del día
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setMovementsDialogOpen(true)}
                >
                  <IconEye className="h-3.5 w-3.5" />
                  Ver todo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-[250px] pr-2">
                <CashRegisterMovements movements={movements} />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ventas pendientes de cobro */}
      {isOpen && (
        <PendingSalesSection
          pendingSales={pendingSales}
          onCollect={handleCollectPendingSale}
          loading={loading}
          exchangeRate={exchangeRate}
          usdtRate={usdtRate}
          virtualAccounts={virtualAccounts}
          cajaAccounts={[...efectivoAccounts, ...virtualAccounts]}
        />
      )}

      {/* Saldos de cuentas (grid unificado) */}
      {isOpen &&
        (efectivoAccounts.length > 0 || virtualAccounts.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconCash className="h-5 w-5" />
                Saldos de cuentas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {/* Efectivo accounts */}
                {efectivoAccounts.map((acc) => {
                  const balance = acc.current_balance || 0;
                  const otherCurrency = acc.currency === "ARS" ? "USD" : "ARS";
                  const rate = acc.currency === "ARS" ? exchangeRate : usdtRate;
                  const equivalent = rate ? balance / rate : 0;
                  return (
                    <div
                      key={acc.id}
                      className="relative rounded-lg border p-3"
                    >
                      <Badge
                        variant="secondary"
                        className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[10px] dark:bg-amber-900/30 dark:text-amber-400"
                      >
                        EFECTIVO
                      </Badge>
                      <p className="text-xs text-muted-foreground truncate mb-1">
                        💵 {acc.name}
                      </p>
                      <p
                        className={`text-lg font-bold ${
                          balance >= 0 ? "text-foreground" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(balance, acc.currency)}
                      </p>
                      {rate > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          ≈ {formatCurrency(equivalent, otherCurrency)}
                        </p>
                      )}
                    </div>
                  );
                })}
                {/* Virtual accounts */}
                {virtualAccounts.map((acc) => {
                  const balance = acc.current_balance || 0;
                  const otherCurrency = acc.currency === "ARS" ? "USD" : "ARS";
                  const rate = acc.currency === "ARS" ? exchangeRate : usdtRate;
                  const equivalent = rate ? balance / rate : 0;
                  return (
                    <div
                      key={acc.id}
                      className="relative rounded-lg border p-3"
                    >
                      <Badge
                        variant="secondary"
                        className="absolute top-2 right-2 bg-blue-100 text-blue-700 text-[10px] dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        VIRTUAL
                      </Badge>
                      <p className="text-xs text-muted-foreground truncate mb-1">
                        💳 {acc.name}
                      </p>
                      <p
                        className={`text-lg font-bold ${
                          balance >= 0 ? "text-foreground" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(balance, acc.currency)}
                      </p>
                      {rate > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          ≈ {formatCurrency(equivalent, otherCurrency)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Siempre mostrar solo la ultima caja cerrada */}
      {!isOpen && latestClosedRegister && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconCash className="h-5 w-5 text-slate-500" />
              Última caja cerrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Fecha</p>
                <p className="font-medium">
                  {new Date(latestClosedRegister.register_date + "T12:00:00").toLocaleDateString("es-AR")}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Apertura</p>
                <p className="text-sm font-medium">
                  {(latestClosedRegister.opening_amounts || []).map((item) => `${item.currency}: ${formatCurrency(item.amount, item.currency)}`).join(" · ") || formatCurrency(latestClosedRegister.opening_amount, latestClosedRegister.currency)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Cierre</p>
                <p className="text-sm font-medium">
                  {(latestClosedRegister.closed_amounts || []).map((item) => `${item.currency}: ${formatCurrency(item.amount, item.currency)}`).join(" · ") || "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Caja stale pendiente de cierre */}
      {staleOpenRegister && (
        <DialogCloseCashRegister
          open={staleDialogOpen}
          onOpenChange={setStaleDialogOpen}
          register={staleOpenRegister}
          movements={movements}
          onConfirm={handleCloseStaleRegister}
          loading={loading}
          exchangeRate={exchangeRate}
          usdtRate={usdtRate}
          accountMovements={accountMovements}
          onSyncEfectivo={handleSyncEfectivo}
          efectivoAccounts={efectivoAccounts}
        />
      )}

      {/* Dialogs */}
      <DialogOpenCashRegister
        open={openDialogOpen}
        onOpenChange={setOpenDialogOpen}
        onConfirm={handleOpenRegister}
        loading={loading}
        efectivoAccounts={efectivoAccounts}
        virtualAccounts={virtualAccounts}
      />

      <DialogCloseCashRegister
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        register={currentRegister}
        movements={movements}
        onConfirm={handleCloseRegister}
        loading={loading}
        exchangeRate={exchangeRate}
        usdtRate={usdtRate}
        accountMovements={accountMovements}
        onSyncEfectivo={handleSyncEfectivo}
        efectivoAccounts={efectivoAccounts}
      />

      <DialogRegisterMovement
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        onConfirm={handleRegisterMovement}
        loading={loading}
        cajaAccounts={[...efectivoAccounts, ...virtualAccounts]}
        externalAccounts={allAccounts.filter(
          (a) => !a.is_efectivo && !a.is_caja_virtual,
        )}
        registerId={currentRegister?.id}
        fxRate={exchangeRate}
        usdtRate={usdtRate}
        onReload={async () => {
          await loadEfectivoAccounts();
          await loadVirtualAccounts();
        }}
      />

      {/* Dialog: Movimientos completos */}
      <Dialog open={movementsDialogOpen} onOpenChange={setMovementsDialogOpen}>
        <DialogContent className="min-w-6xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconArrowsRightLeft className="h-5 w-5" />
              Movimientos del día
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[65vh] pr-2">
            <CashRegisterMovements
              movements={movements}
              variant="dialog"
              onVoidSale={isOpen ? openVoidSale : undefined}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={voidSaleOpen} onOpenChange={setVoidSaleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular venta #{voidSaleId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Destino del stock</Label>
              <Select value={voidSaleBucket} onValueChange={setVoidSaleBucket}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="defective">Defectuoso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                value={voidSaleReason}
                onChange={(event) => setVoidSaleReason(event.target.value)}
                placeholder="Motivo de la anulación..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVoidSaleOpen(false)}
              disabled={voidSaleLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoidSale}
              disabled={voidSaleLoading}
            >
              {voidSaleLoading ? "Anulando..." : "Anular venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Botón flotante: Nuevo movimiento */}
      {isOpen && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="fixed bottom-20 right-6 h-12 w-12 rounded-full shadow-lg z-50"
                onClick={() => setMovementDialogOpen(true)}
              >
                <IconArrowsRightLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Nuevo movimiento</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Botón flotante: Cerrar caja */}
      {isOpen && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50"
                onClick={() => setCloseDialogOpen(true)}
              >
                <IconArrowRight className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Cerrar caja</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
