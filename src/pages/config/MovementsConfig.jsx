import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContextProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { IconCalendar, IconRefresh, IconChartBar } from "@tabler/icons-react";

const formatCurrency = (value, currency) => {
  const safe = Number(value || 0);
  if (currency === "USDT") {
    return `USDT ${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)}`;
  }
  const formatCurrency = currency === "USD" ? "USD" : "ARS";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-AR", {
    style: "currency",
    currency: formatCurrency,
    minimumFractionDigits: 2,
  }).format(safe);
};

const todayDateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const isMovementPendingAccreditation = (movement) =>
  movement?.accreditation_status === "pending" &&
  movement?.available_on &&
  movement.available_on > todayDateKey();

export default function MovementsConfig() {
  const { role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";
  const CHART_COLORS = [
    "#16A34A",
    "#059669",
    "#0E7490",
    "#2563EB",
    "#7C3AED",
    "#DB2777",
    "#DC2626",
    "#EA580C",
    "#D97706",
    "#65A30D",
  ];

  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [balanceMovementsAll, setBalanceMovementsAll] = useState([]);
  const [balanceMovementsFiltered, setBalanceMovementsFiltered] = useState([]);
  const [incomeChartData, setIncomeChartData] = useState([]);
  const [expenseChartData, setExpenseChartData] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartCurrency, setChartCurrency] = useState("ARS");
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMovement, setDetailMovement] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [filters, setFilters] = useState({
    accountId: "all",
    type: "all",
  });
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [fxRate, setFxRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [stockCostUsd, setStockCostUsd] = useState(0);

  if (!isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  const loadAccounts = useCallback(async () => {
    const [
      { data: accountsData, error: accountsError },
      { data: blueRateData, error: blueRateError },
      { data: usdtRateData, error: usdtRateError },
      { data: variantsData, error: variantsError },
    ] = await Promise.all([
      supabase
        .from("accounts")
        .select(
          "id, name, currency, initial_balance, include_in_balance, is_reference_capital"
        )
        .order("name", { ascending: true }),
      supabase
        .from("fx_rates")
        .select("rate")
        .eq("source", "blue")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("fx_rates")
        .select("rate")
        .eq("source", "USDT")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("product_variants")
        .select("stock, cost_price_usd"),
    ]);

    if (accountsError) {
      toast.error("No se pudieron cargar las cuentas", {
        description: accountsError.message,
      });
      return;
    }

    if (blueRateError) {
      toast.error("No se pudo cargar la cotizacion USD", {
        description: blueRateError.message,
      });
    }

    if (usdtRateError) {
      toast.error("No se pudo cargar la cotizacion USDT", {
        description: usdtRateError.message,
      });
    }

    if (variantsError) {
      toast.error("No se pudo cargar el costo del stock", {
        description: variantsError.message,
      });
    }

    setAccounts(accountsData || []);
    setFxRate(Number(blueRateData?.rate || 0) || null);
    setUsdtRate(Number(usdtRateData?.rate || 0) || null);
    setStockCostUsd(
      (variantsData || []).reduce((total, variant) => {
        const stock = Number(variant.stock || 0);
        const cost = Number(variant.cost_price_usd || 0);
        return total + stock * cost;
      }, 0)
    );
  }, []);

  const loadBalancesAll = useCallback(async () => {
    const { data, error } = await supabase
      .from("account_movements")
      .select("account_id, type, amount, accreditation_status, available_on");

    if (error) {
      toast.error("No se pudo cargar el balance", {
        description: error.message,
      });
      return;
    }

    setBalanceMovementsAll(data || []);
  }, []);

  const loadBalancesFiltered = useCallback(async () => {
    let query = supabase
      .from("account_movements")
      .select("account_id, type, amount, accreditation_status, available_on");

    if (filters.accountId !== "all") {
      query = query.eq("account_id", filters.accountId);
    }
    if (filters.type !== "all") {
      query = query.eq("type", filters.type);
    }
    if (dateRange?.from) {
      query = query.gte(
        "movement_date",
        dateRange.from.toISOString().slice(0, 10),
      );
    }
    if (dateRange?.to) {
      query = query.lte(
        "movement_date",
        dateRange.to.toISOString().slice(0, 10),
      );
    }

    const { data, error } = await query;

    if (error) {
      toast.error("No se pudo cargar el balance filtrado", {
        description: error.message,
      });
      return;
    }

    setBalanceMovementsFiltered(data || []);
  }, [filters, dateRange]);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("account_movements")
      .select(
        "id, created_at, movement_date, account_id, type, amount, currency, amount_ars, related_table, related_id, notes, accreditation_status, available_on, accounts(name, currency)",
        { count: "exact" },
      )
      .order("movement_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (filters.accountId !== "all") {
      query = query.eq("account_id", filters.accountId);
    }
    if (filters.type !== "all") {
      query = query.eq("type", filters.type);
    }
    if (dateRange?.from) {
      query = query.gte(
        "movement_date",
        dateRange.from.toISOString().slice(0, 10),
      );
    }
    if (dateRange?.to) {
      query = query.lte(
        "movement_date",
        dateRange.to.toISOString().slice(0, 10),
      );
    }

    const { data, error, count } = await query;

    if (error) {
      toast.error("No se pudieron cargar los movimientos", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    setMovements(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [filters, page, pageSize, dateRange]);

  const buildCategoryLabel = (movement, expensesMap) => {
    if (movement.related_table === "sale_payments") return "Ventas";
    if (movement.related_table === "sale_payment_history") return "Ventas";
    if (movement.related_table === "sale_reversal") return "Anulaciones de venta";
    if (movement.related_table === "purchase_payments") return "Compras";
    if (movement.related_table === "purchase_reversal") return "Anulaciones de compra";
    if (movement.related_table === "account_transfer") return null;
    if (
      movement.related_table === "expenses" ||
      movement.related_table === "expense_reversal" ||
      movement.related_table === "expense_payment_history"
    ) {
      return expensesMap.get(movement.related_id) || "Sin categoria";
    }
    if (movement.related_table === "manual_income") {
      const match = movement.notes?.match(/Categoria:\s*([^|]+)/i);
      if (match?.[1]) return match[1].trim();
      return "Ingresos";
    }
    return "Otros";
  };

  const loadCharts = useCallback(async () => {
    setChartsLoading(true);

    let query = supabase
      .from("account_movements")
      .select("id, type, amount, currency, related_table, related_id, notes");

    if (filters.accountId !== "all") {
      query = query.eq("account_id", filters.accountId);
    }
    if (filters.type !== "all") {
      query = query.eq("type", filters.type);
    }
    if (dateRange?.from) {
      query = query.gte(
        "movement_date",
        dateRange.from.toISOString().slice(0, 10),
      );
    }
    if (dateRange?.to) {
      query = query.lte(
        "movement_date",
        dateRange.to.toISOString().slice(0, 10),
      );
    }

    const { data, error } = await query;

    if (error) {
      toast.error("No se pudieron cargar los graficos", {
        description: error.message,
      });
      setChartsLoading(false);
      return;
    }

    const movementsData = data || [];
    const expenseIds = movementsData
      .filter((m) => m.related_table === "expenses" && m.related_id)
      .map((m) => m.related_id);

    let expensesMap = new Map();
    if (expenseIds.length) {
      const { data: expensesData, error: expensesError } = await supabase
        .from("expenses")
        .select("id, category")
        .in("id", expenseIds);

      if (!expensesError) {
        expensesMap = new Map(
          (expensesData || []).map((item) => [item.id, item.category]),
        );
      }
    }

    const groupByCategory = (type) => {
      const grouped = new Map();
      movementsData.forEach((movement) => {
        if (movement.type !== type) return;
        if (movement.currency !== chartCurrency) return;
        const label = buildCategoryLabel(movement, expensesMap);
        if (!label) return;
        const currency = movement.currency || "ARS";
        const value = Number(movement.amount ?? 0);
        if (!value) return;
        const key = `${label}__${currency}`;
        grouped.set(key, (grouped.get(key) || 0) + value);
      });

      return Array.from(grouped.entries())
        .map(([key, value]) => {
          const [name, currency] = key.split("__");
          return { name: `${name} (${currency})`, value, currency };
        })
        .sort((a, b) => b.value - a.value);
    };

    setIncomeChartData(groupByCategory("income"));
    setExpenseChartData(groupByCategory("expense"));
    setChartsLoading(false);
  }, [dateRange, filters, chartCurrency]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    loadBalancesAll();
  }, [loadBalancesAll]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    loadBalancesFiltered();
  }, [loadBalancesFiltered]);

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  useEffect(() => {
    setPage(1);
  }, [filters.accountId, filters.type, dateRange]);

  const handleWeekFilter = () => {
    setDateRange({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 }),
    });
  };

  const accountBalancesAll = useMemo(() => {
    const totals = new Map();
    balanceMovementsAll.forEach((m) => {
      if (isMovementPendingAccreditation(m)) return;
      const key = Number(m.account_id);
      const entry = totals.get(key) || { income: 0, expense: 0 };
      if (m.type === "income") entry.income += Number(m.amount || 0);
      if (m.type === "expense") entry.expense += Number(m.amount || 0);
      totals.set(key, entry);
    });

    return accounts.map((acc) => {
      const key = Number(acc.id);
      const totalsForAccount = totals.get(key) || { income: 0, expense: 0 };
      const current =
        Number(acc.initial_balance || 0) +
        totalsForAccount.income -
        totalsForAccount.expense;
      return {
        ...acc,
        income: totalsForAccount.income,
        expense: totalsForAccount.expense,
        current_balance: current,
      };
    });
  }, [accounts, balanceMovementsAll]);

  const accountBalancesFiltered = useMemo(() => {
    const totals = new Map();
    balanceMovementsFiltered.forEach((m) => {
      if (isMovementPendingAccreditation(m)) return;
      const key = Number(m.account_id);
      const entry = totals.get(key) || { income: 0, expense: 0 };
      if (m.type === "income") entry.income += Number(m.amount || 0);
      if (m.type === "expense") entry.expense += Number(m.amount || 0);
      totals.set(key, entry);
    });

    return accounts.map((acc) => {
      const key = Number(acc.id);
      const totalsForAccount = totals.get(key) || { income: 0, expense: 0 };
      const current =
        Number(acc.initial_balance || 0) +
        totalsForAccount.income -
        totalsForAccount.expense;
      return {
        ...acc,
        income: totalsForAccount.income,
        expense: totalsForAccount.expense,
        current_balance: current,
      };
    });
  }, [accounts, balanceMovementsFiltered]);

  const totalBalances = useMemo(() => {
    return accountBalancesAll.reduce(
      (acc, item) => {
        if (!item.include_in_balance) return acc;
        if (item.currency === "USD") acc.usd += item.current_balance;
        else if (item.currency === "USDT") acc.usdt += item.current_balance;
        else acc.ars += item.current_balance;
        return acc;
      },
      { ars: 0, usd: 0, usdt: 0 },
    );
  }, [accountBalancesAll]);

  const convertAmountToUsd = useCallback(
    (amount, currency) => {
      const safeAmount = Number(amount || 0);
      if (!safeAmount) return 0;
      if (currency === "USD") return safeAmount;
      if (currency === "USDT") {
        if (usdtRate && fxRate) return (safeAmount * usdtRate) / fxRate;
        return safeAmount;
      }
      if (currency === "ARS") {
        if (!fxRate) return 0;
        return safeAmount / fxRate;
      }
      return 0;
    },
    [fxRate, usdtRate]
  );

  const businessMetrics = useMemo(() => {
    const operatingCashUsd = accountBalancesAll.reduce((total, account) => {
      if (!account.include_in_balance) return total;
      return total + convertAmountToUsd(account.current_balance, account.currency);
    }, 0);

    const referenceCapitalUsd = accountBalancesAll.reduce((total, account) => {
      if (!account.is_reference_capital) return total;
      return total + convertAmountToUsd(account.current_balance, account.currency);
    }, 0);

    const realResultUsd = operatingCashUsd + stockCostUsd - referenceCapitalUsd;

    return {
      operatingCashUsd,
      referenceCapitalUsd,
      stockCostUsd,
      realResultUsd,
    };
  }, [accountBalancesAll, convertAmountToUsd, stockCostUsd]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const openMovementDetail = useCallback(async (movement) => {
    setDetailMovement(movement);
    setDetailData(null);
    setDetailOpen(true);

    if (!movement?.related_table || !movement?.related_id) return;
    setDetailLoading(true);

    let detailResponse = null;
    if (
      movement.related_table === "sale_payments" ||
      movement.related_table === "sale_payment_history" ||
      movement.related_table === "sale_reversal"
    ) {
      detailResponse = await supabase
        .from("sale_payments")
        .select(
          "id, sale_id, amount_ars, amount_usd, payment_method_id, installments, reference, created_at, payment_methods(name, accreditation_delay_business_days), sales(id, total_ars, customer_id, customers:customers!sales_customer_id_fkey(name, last_name))",
        )
        .eq("id", movement.related_id)
        .maybeSingle();
    } else if (
      movement.related_table === "purchase_payments" ||
      movement.related_table === "purchase_reversal"
    ) {
      detailResponse = await supabase
        .from("purchase_payments")
        .select(
          "id, purchase_id, amount, currency, amount_ars, payment_method_id, created_at, purchases(purchase_date, total_amount, currency, providers(name)), payment_methods(name)",
        )
        .eq("id", movement.related_id)
        .maybeSingle();
    } else if (
      movement.related_table === "expenses" ||
      movement.related_table === "expense_reversal" ||
      movement.related_table === "expense_payment_history"
    ) {
      detailResponse = await supabase
        .from("expenses")
        .select(
          "id, expense_date, amount, currency, amount_ars, category, type, notes, account_id",
        )
        .eq("id", movement.related_id)
        .maybeSingle();
    }

    if (detailResponse?.error) {
      toast.error("No se pudo cargar el detalle", {
        description: detailResponse.error.message,
      });
      setDetailLoading(false);
      return;
    }

    setDetailData(detailResponse?.data || null);
    setDetailLoading(false);
  }, []);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Movimientos</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setChartsOpen(true)} variant="outline">
              <IconChartBar className="h-4 w-4" />
              Gráficos
            </Button>
            <Button onClick={loadMovements} disabled={loading}>
              <IconRefresh className="h-4 w-4" />
              {loading ? "Actualizando..." : "Actualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Fecha</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 min-w-[220px]"
                    >
                      <IconCalendar className="h-4 w-4" />
                      {dateRange?.from && dateRange?.to
                        ? `${dateRange.from.toLocaleDateString(
                            "es-AR",
                          )} - ${dateRange.to.toLocaleDateString("es-AR")}`
                        : "Filtrar por fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-3" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={setDateRange}
                      locale={es}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Semana</span>
                <Button variant="outline" onClick={handleWeekFilter}>
                  Semana actual
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 md:justify-end">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Cuenta</span>
                <Select
                  value={filters.accountId}
                  onValueChange={(value) =>
                    setFilters((f) => ({ ...f, accountId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las cuentas</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.name} ({acc.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Tipo</span>
                <Select
                  value={filters.type}
                  onValueChange={(value) =>
                    setFilters((f) => ({ ...f, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="income">Ingresos</SelectItem>
                    <SelectItem value="expense">Egresos</SelectItem>
                    <SelectItem value="transfer">Transferencias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Acreditacion</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const pendingAccreditation = isMovementPendingAccreditation(m);

                  return (
                    <TableRow
                      key={m.id}
                      className={`cursor-pointer ${
                        pendingAccreditation
                          ? "bg-yellow-100 hover:bg-yellow-200/80 dark:bg-yellow-950/25 dark:hover:bg-yellow-900/35"
                          : m.type === "income"
                            ? "bg-green-100 hover:bg-green-200/80 dark:bg-green-950/25 dark:hover:bg-green-900/35"
                            : m.type === "expense"
                              ? "bg-red-100 hover:bg-red-200/80 dark:bg-red-950/25 dark:hover:bg-red-900/35"
                              : ""
                      }`}
                      onClick={() => openMovementDetail(m)}
                    >
                      <TableCell>{m.movement_date}</TableCell>
                      <TableCell>
                        {m.accounts?.name || `Cuenta ${m.account_id}`}
                      </TableCell>
                      <TableCell>
                        {m.related_table === "sale_payment_history"
                          ? "Historial"
                          : m.type === "income"
                          ? "Ingreso"
                          : m.type === "expense"
                            ? "Egreso"
                            : "Transferencia"}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(m.amount, m.currency)}
                      </TableCell>
                      <TableCell>
                        {pendingAccreditation
                          ? `Pendiente hasta ${m.available_on}`
                          : m.available_on
                            ? `Acreditado ${m.available_on}`
                            : "-"}
                      </TableCell>
                      <TableCell>
                        {m.related_table === "account_transfer"
                          ? "Transferencia"
                          : m.related_table === "sale_payments"
                            ? "Venta"
                            : m.related_table === "sale_payment_history"
                              ? "Historial venta"
                              : m.related_table === "sale_reversal"
                                ? "Anulacion venta"
                            : m.related_table === "expenses"
                              ? "Gasto"
                              : m.related_table === "expense_reversal"
                                ? "Anulacion gasto"
                                : m.related_table === "expense_payment_history"
                                  ? "Pago gasto"
                              : m.related_table === "purchase_payments"
                                ? "Compra"
                                : m.related_table === "purchase_reversal"
                                  ? "Anulacion compra"
                                : m.related_table === "commission_payments"
                                  ? "Pago"
                                  : m.related_table
                                    ? `${m.related_table} ${m.related_id ? `#${m.related_id}` : ""}`
                                    : "-"}
                      </TableCell>
                      <TableCell>{m.notes || "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground"
                    >
                      No hay movimientos para mostrar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="text-sm text-muted-foreground">
              Mostrando {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, totalCount)} de {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                Anterior
              </Button>
              <div className="text-sm">
                {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Detalle del movimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Fecha:</strong> {detailMovement?.movement_date || "-"}
            </div>
            <div>
              <strong>Cuenta:</strong> {detailMovement?.accounts?.name || "-"}
            </div>
            <div>
              <strong>Monto:</strong>{" "}
              {formatCurrency(detailMovement?.amount, detailMovement?.currency)}
            </div>
            <div>
              <strong>Tipo:</strong>{" "}
              {detailMovement?.related_table === "sale_payment_history"
                ? "Historial"
                : detailMovement?.type === "income"
                ? "Ingreso"
                : detailMovement?.type === "expense"
                  ? "Egreso"
                  : "Transferencia"}
            </div>
            <div>
              <strong>Acreditacion:</strong>{" "}
              {isMovementPendingAccreditation(detailMovement)
                ? `Pendiente hasta ${detailMovement.available_on}`
                : detailMovement?.available_on
                  ? `Acreditado ${detailMovement.available_on}`
                  : "-"}
            </div>
            <div>
              <strong>Origen:</strong>{" "}
              {detailMovement?.related_table
                ? detailMovement.related_table === "sale_payments"
                  ? `Venta`
                  : detailMovement.related_table === "sale_payment_history"
                    ? "Historial venta"
                  : detailMovement.related_table === "sale_reversal"
                      ? "Anulacion venta"
                  : `${
                      detailMovement.related_table === "purchase_payments"
                        ? "Compra"
                        : detailMovement.related_table === "purchase_reversal"
                          ? "Anulacion compra"
                        : detailMovement.related_table === "expenses"
                          ? "Gasto"
                          : detailMovement.related_table === "expense_reversal"
                            ? "Anulacion gasto"
                            : detailMovement.related_table === "expense_payment_history"
                              ? "Pago gasto"
                          : detailMovement.related_table === "account_transfer"
                            ? "Transferencia"
                            : detailMovement.related_table
                    }${
                      detailMovement.related_id
                        ? ` #${detailMovement.related_id}`
                        : ""
                    }`
                : "Manual"}
            </div>
            {detailMovement?.notes && (
              <div>
                <strong>Notas:</strong> {detailMovement.notes}
              </div>
            )}
          </div>
          <div className="rounded-md border p-3 text-sm">
            {detailLoading && (
              <div className="text-muted-foreground">Cargando detalle...</div>
            )}
            {!detailLoading && !detailData && (
              <div className="text-muted-foreground">
                No hay detalle adicional.
              </div>
            )}
            {!detailLoading && detailData && (
              <div className="space-y-2">
                {(detailMovement?.related_table === "sale_payments" ||
                  detailMovement?.related_table === "sale_payment_history" ||
                  detailMovement?.related_table === "sale_reversal") && (
                  <>
                    <div>
                      <strong>Venta:</strong> #{detailData.sale_id}
                    </div>
                    <div>
                      <strong>Cliente:</strong>{" "}
                      {detailData?.sales?.customers
                        ? `${detailData.sales.customers.name || ""} ${
                            detailData.sales.customers.last_name || ""
                          }`.trim() || "Sin cliente"
                        : detailData?.sales?.customer_id
                          ? `Cliente #${detailData.sales.customer_id}`
                          : "Sin cliente"}
                    </div>
                    <div>
                      <strong>Metodo:</strong>{" "}
                      {detailData.payment_methods?.name || "-"}
                    </div>
                    <div>
                      <strong>Demora configurada:</strong>{" "}
                      {Number(
                        detailData.payment_methods
                          ?.accreditation_delay_business_days || 0
                      ) === 0
                        ? "Inmediata"
                        : `${detailData.payment_methods.accreditation_delay_business_days} dias habiles`}
                    </div>
                    <div>
                      <strong>Cuotas:</strong> {detailData.installments || "-"}
                    </div>
                    {detailData.reference && (
                      <div>
                        <strong>Referencia:</strong> {detailData.reference}
                      </div>
                    )}
                  </>
                )}
                {(detailMovement?.related_table === "purchase_payments" ||
                  detailMovement?.related_table === "purchase_reversal") && (
                  <>
                    <div>
                      <strong>Compra:</strong> #{detailData.purchase_id}
                    </div>
                    <div>
                      <strong>Proveedor:</strong>{" "}
                      {detailData.purchases?.providers?.name || "-"}
                    </div>
                    <div>
                      <strong>Metodo:</strong>{" "}
                      {detailData.payment_methods?.name || "-"}
                    </div>
                    <div>
                      <strong>Fecha compra:</strong>{" "}
                      {detailData.purchases?.purchase_date || "-"}
                    </div>
                  </>
                )}
                {(detailMovement?.related_table === "expenses" ||
                  detailMovement?.related_table === "expense_reversal" ||
                  detailMovement?.related_table === "expense_payment_history") && (
                  <>
                    <div>
                      <strong>Categoria:</strong> {detailData.category || "-"}
                    </div>
                    <div>
                      <strong>Tipo:</strong> {detailData.type || "-"}
                    </div>
                    <div>
                      <strong>Fecha gasto:</strong>{" "}
                      {detailData.expense_date || "-"}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Drawer open={chartsOpen} onOpenChange={setChartsOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="gap-1 relative">
            <DrawerTitle>Gráficos</DrawerTitle>
            <DrawerDescription>
              {dateRange?.from && dateRange?.to
                ? `${dateRange.from.toLocaleDateString(
                    "es-AR",
                  )} - ${dateRange.to.toLocaleDateString("es-AR")}`
                : "Sin fecha seleccionada"}
            </DrawerDescription>
            <div className="absolute left-1/2 -bottom-6 w-[100px] -translate-x-1/2">
              <Select
                value={chartCurrency}
                onValueChange={(value) => setChartCurrency(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Moneda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DrawerHeader>
          <div className="">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col items-center">
                <div className="text-2xl font-semibold">Ingresos</div>
                {chartsLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Cargando grafico...
                  </div>
                ) : incomeChartData.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin datos</div>
                ) : (
                  <div className="w-full h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={incomeChartData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius="80%"
                          label
                        >
                          {incomeChartData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Legend verticalAlign="bottom" />
                        <ChartTooltip
                          formatter={(value, _name, props) => [
                            formatCurrency(value, props.payload.currency),
                            props.payload.name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center">
                <div className="text-2xl font-semibold">Egresos</div>
                {chartsLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Cargando grafico...
                  </div>
                ) : expenseChartData.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin datos</div>
                ) : (
                  <div className="w-full h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseChartData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius="80%"
                          label
                        >
                          {expenseChartData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Legend verticalAlign="bottom" />
                        <ChartTooltip
                          formatter={(value, _name, props) => [
                            formatCurrency(value, props.payload.currency),
                            props.payload.name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" className="w-150 m-auto">
                Cerrar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
