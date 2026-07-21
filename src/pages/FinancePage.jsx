import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContextProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  IconCalendar,
  IconRefresh,
  IconDotsVertical,
  IconTableExport,
  IconPdf,
} from "@tabler/icons-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const formatCurrency = (value, currency) => {
  const safe = Number(value || 0);
  if (currency === "USDT") {
    return `USDT ${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)}`;
  }
  const resolvedCurrency = currency === "USD" ? "USD" : "ARS";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-AR", {
    style: "currency",
    currency: resolvedCurrency,
    minimumFractionDigits: 2,
  }).format(safe);
};

const getCurrencyBadgeClass = (currency) => {
  if (currency === "USD") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (currency === "USDT") {
    return "border-teal-200 bg-teal-50 text-teal-700";
  }
  return "border-sky-200 bg-sky-50 text-sky-700";
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

export default function FinancePage() {
  const { role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";
  const [loading, setLoading] = useState(false);
  const [monthlyNetIncomeLoading, setMonthlyNetIncomeLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [balanceMovementsAll, setBalanceMovementsAll] = useState([]);
  const [balanceMovementsFiltered, setBalanceMovementsFiltered] = useState([]);
  const [fxRate, setFxRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [stockCostUsd, setStockCostUsd] = useState(0);
  const [aftersalesStockCostUsd, setAftersalesStockCostUsd] = useState(0);
  const [filters, setFilters] = useState({
    accountId: "all",
    type: "all",
  });
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [monthlyNetIncome, setMonthlyNetIncome] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [salesYears, setSalesYears] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [selectedSalesChannels, setSelectedSalesChannels] = useState([]);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailMonth, setDetailMonth] = useState(null);
  const [detailSales, setDetailSales] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState(null);
  const [exportTargetMonth, setExportTargetMonth] = useState("");

  const loadStaticData = useCallback(async () => {
    setLoading(true);
    const [
      { data: accountsData, error: accountsError },
      { data: blueRateData, error: blueRateError },
      { data: usdtRateData, error: usdtRateError },
      { data: variantsData, error: variantsError },
      { data: aftersalesData, error: aftersalesError },
      { data: movementsData, error: movementsError },
      { data: salesChannelsData, error: salesChannelsError },
      { data: salesYearsData, error: salesYearsError },
    ] = await Promise.all([
      supabase
        .from("accounts")
        .select(
          "id, name, currency, initial_balance, include_in_balance, is_reference_capital",
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
      supabase.from("product_variants").select("stock, cost_price_usd"),
      supabase
        .from("aftersales_devices")
        .select(
          "quantity, status, sold_sale_id, include_in_stock_cost_balance, variant:product_variants!aftersales_devices_variant_id_fkey(cost_price_usd)",
        ),
      supabase
        .from("account_movements")
        .select(
          "account_id, type, amount, currency, accreditation_status, available_on",
        ),
      supabase
        .from("sales_channels")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("sales")
        .select("sale_date")
        .eq("status", "vendido")
        .is("voided_at", null),
    ]);

    if (accountsError) {
      toast.error("No se pudieron cargar las cuentas", {
        description: accountsError.message,
      });
    } else {
      setAccounts(accountsData || []);
    }

    if (blueRateError) {
      toast.error("No se pudo cargar la cotizacion USD", {
        description: blueRateError.message,
      });
    } else {
      setFxRate(Number(blueRateData?.rate || 0) || null);
    }

    if (usdtRateError) {
      toast.error("No se pudo cargar la cotizacion USDT", {
        description: usdtRateError.message,
      });
    } else {
      setUsdtRate(Number(usdtRateData?.rate || 0) || null);
    }

    if (variantsError) {
      toast.error("No se pudo cargar el costo del stock", {
        description: variantsError.message,
      });
    } else {
      setStockCostUsd(
        (variantsData || []).reduce((total, variant) => {
          const stock = Number(variant.stock || 0);
          const cost = Number(variant.cost_price_usd || 0);
          return total + stock * cost;
        }, 0),
      );
    }

    if (aftersalesError) {
      toast.error("No se pudo cargar el stock de postventa", {
        description: aftersalesError.message,
      });
    } else {
      setAftersalesStockCostUsd(
        (aftersalesData || []).reduce((total, device) => {
          if (!device.include_in_stock_cost_balance) return total;
          if (device.sold_sale_id != null) return total;
          if (device.status === "repaired") return total;
          const quantity = Number(device.quantity || 0);
          const cost = Number(device.variant?.cost_price_usd || 0);
          return total + quantity * cost;
        }, 0),
      );
    }

    if (movementsError) {
      toast.error("No se pudo cargar el balance general", {
        description: movementsError.message,
      });
    } else {
      setBalanceMovementsAll(movementsData || []);
    }

    if (salesChannelsError) {
      toast.error("No se pudieron cargar los canales de venta", {
        description: salesChannelsError.message,
      });
    } else {
      setSalesChannels(salesChannelsData || []);
    }

    if (salesYearsError) {
      toast.error("No se pudieron cargar los años de ventas", {
        description: salesYearsError.message,
      });
    } else {
      const years = Array.from(
        new Set(
          (salesYearsData || [])
            .map((sale) => new Date(sale.sale_date).getFullYear())
            .filter((year) => Number.isFinite(year)),
        ),
      ).sort((a, b) => b - a);

      setSalesYears(years);
      setSelectedYear((currentYear) =>
        years.length > 0 && !years.includes(currentYear)
          ? years[0]
          : currentYear,
      );
    }

    setLoading(false);
  }, []);

  const loadMonthlyNetIncome = useCallback(async () => {
    setMonthlyNetIncomeLoading(true);
    const yearStart = new Date(`${selectedYear}-01-01`)
      .toISOString()
      .split("T")[0];
    const yearEnd = new Date(`${selectedYear}-12-31`)
      .toISOString()
      .split("T")[0];

    let salesQuery = supabase
      .from("sales")
      .select(
        `
        id,
        sale_date,
        status,
        total_usd,
        sales_channel_id,
        sale_items(
          id,
          quantity,
          usd_price,
          cost_price_usd,
          variant_id
        )
      `,
      )
      .eq("status", "vendido")
      .is("voided_at", null)
      .gte("sale_date", yearStart)
      .lte("sale_date", yearEnd);

    if (
      selectedSalesChannels.length === 1 &&
      selectedSalesChannels[0] === "none"
    ) {
      salesQuery = salesQuery.is("sales_channel_id", null);
    } else if (selectedSalesChannels.length > 0) {
      const channelIds = selectedSalesChannels
        .filter((channelId) => channelId !== "none")
        .map(Number);

      if (channelIds.length > 0 && selectedSalesChannels.includes("none")) {
        salesQuery = salesQuery.or(
          `sales_channel_id.in.(${channelIds.join(",")}),sales_channel_id.is.null`,
        );
      } else if (channelIds.length > 0) {
        salesQuery = salesQuery.in("sales_channel_id", channelIds);
      }
    }

    const { data: salesData, error: salesError } = await salesQuery;

    if (salesError) {
      console.error("Error loading net income:", salesError);
      toast.error("No se pudieron cargar los ingresos netos", {
        description: salesError.message,
      });
      setMonthlyNetIncomeLoading(false);
      return;
    }

    // Obtener el ingreso real acreditado desde account_movements
    const saleIds = (salesData || []).map((s) => s.id);
    const saleAccreditedIncome = {};

    if (saleIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("sale_payments")
        .select("id, sale_id")
        .in("sale_id", saleIds);

      const paymentIds = (paymentsData || []).map((p) => p.id);

      if (paymentIds.length > 0) {
        const { data: incomeMovements } = await supabase
          .from("account_movements")
          .select(
            "amount, currency, related_id, accreditation_status, available_on",
          )
          .eq("type", "income")
          .in("related_table", ["sale_payments", "sale_payment_history"])
          .in("related_id", paymentIds);

        const paymentToSale = new Map(
          (paymentsData || []).map((p) => [p.id, p.sale_id]),
        );
        const today = todayDateKey();

        for (const m of incomeMovements || []) {
          if (
            m.accreditation_status === "pending" &&
            m.available_on &&
            m.available_on > today
          )
            continue;

          const saleId = paymentToSale.get(m.related_id);
          if (!saleId) continue;

          const amount = Number(m.amount || 0);
          if (!amount) continue;

          let amountUsd = null;
          if (m.currency === "USD") {
            amountUsd = amount;
          } else if (m.currency === "USDT") {
            if (usdtRate && fxRate) amountUsd = (amount * usdtRate) / fxRate;
            else amountUsd = amount;
          } else if (m.currency === "ARS") {
            if (fxRate) amountUsd = amount / fxRate;
          }

          if (amountUsd === null) continue;

          saleAccreditedIncome[saleId] =
            (saleAccreditedIncome[saleId] || 0) + amountUsd;
        }
      }
    }

    // Calcular ingresos netos por mes usando el ingreso real acreditado
    const monthlyData = {};

    (salesData || []).forEach((sale) => {
      const saleDate = new Date(sale.sale_date);
      const monthKey = saleDate.toLocaleString("es-AR", {
        year: "numeric",
        month: "2-digit",
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          totalSales: 0,
          totalCost: 0,
          netIncome: 0,
          salesCount: 0,
        };
      }

      const income =
        saleAccreditedIncome[sale.id] ?? Number(sale.total_usd || 0);
      monthlyData[monthKey].totalSales += income;

      sale.sale_items?.forEach((item) => {
        const quantity = Number(item.quantity || 0);
        const costPrice = Number(item.cost_price_usd ?? 0);
        monthlyData[monthKey].totalCost += quantity * costPrice;
      });

      monthlyData[monthKey].salesCount += 1;
    });

    Object.keys(monthlyData).forEach((key) => {
      monthlyData[key].netIncome =
        monthlyData[key].totalSales - monthlyData[key].totalCost;
    });

    const sortedData = Object.values(monthlyData).sort((a, b) => {
      return b.month.localeCompare(a.month);
    });

    setMonthlyNetIncome(sortedData);
    setMonthlyNetIncomeLoading(false);
  }, [selectedSalesChannels, selectedYear, fxRate, usdtRate]);

  const loadMonthDetail = useCallback(async (monthKey) => {
    setDetailLoading(true);
    setDetailMonth(monthKey);
    const [month, year] = monthKey.split("/");
    const paddedMonth = month.padStart(2, "0");
    const monthStart = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const monthEnd = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    let salesQuery = supabase
      .from("sales")
      .select(`id,sale_date,total_usd,fx_rate_used,seller_id,sales_channels(name),sale_items(product_name,variant_name,quantity,usd_price,cost_price_usd,subtotal_usd,commission_pct,commission_fixed)`)
      .eq("status", "vendido")
      .is("voided_at", null)
      .gte("sale_date", monthStart)
      .lte("sale_date", monthEnd);

    if (
      selectedSalesChannels.length === 1 &&
      selectedSalesChannels[0] === "none"
    ) {
      salesQuery = salesQuery.is("sales_channel_id", null);
    } else if (selectedSalesChannels.length > 0) {
      const channelIds = selectedSalesChannels
        .filter((channelId) => channelId !== "none")
        .map(Number);

      if (channelIds.length > 0 && selectedSalesChannels.includes("none")) {
        salesQuery = salesQuery.or(
          `sales_channel_id.in.(${channelIds.join(",")}),sales_channel_id.is.null`,
        );
      } else if (channelIds.length > 0) {
        salesQuery = salesQuery.in("sales_channel_id", channelIds);
      }
    }

    salesQuery = salesQuery.order("sale_date", { ascending: false });

    const { data: salesData, error } = await salesQuery;

    if (error) {
      console.error("Error loading month detail:", error);
      toast.error("No se pudieron cargar las ventas del mes", {
        description: error.message,
      });
      setDetailLoading(false);
      return;
    }

    const saleIds = (salesData || []).map((s) => s.id);
    const uniqueSellerIds = [...new Set((salesData || []).map((s) => s.seller_id).filter(Boolean))];
    const saleAccreditedIncome = {};
    const sellerRoleMap = {};

    if (uniqueSellerIds.length > 0) {
      const { data: sellerUsers } = await supabase
        .from("users")
        .select("id_auth, role")
        .in("id_auth", uniqueSellerIds);

      (sellerUsers || []).forEach((u) => {
        sellerRoleMap[u.id_auth] = u.role;
      });
    }

    if (saleIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("sale_payments")
        .select("id, sale_id")
        .in("sale_id", saleIds);

      const paymentIds = (paymentsData || []).map((p) => p.id);

      if (paymentIds.length > 0) {
        const { data: incomeMovements } = await supabase
          .from("account_movements")
          .select(
            "amount, currency, related_id, accreditation_status, available_on",
          )
          .eq("type", "income")
          .in("related_table", ["sale_payments", "sale_payment_history"])
          .in("related_id", paymentIds);

        const paymentToSale = new Map(
          (paymentsData || []).map((p) => [p.id, p.sale_id]),
        );
        const today = todayDateKey();

        for (const m of incomeMovements || []) {
          if (
            m.accreditation_status === "pending" &&
            m.available_on &&
            m.available_on > today
          )
            continue;

          const saleId = paymentToSale.get(m.related_id);
          if (!saleId) continue;

          const amount = Number(m.amount || 0);
          if (!amount) continue;

          let amountUsd = null;
          if (m.currency === "USD") {
            amountUsd = amount;
          } else if (m.currency === "USDT") {
            if (usdtRate && fxRate) amountUsd = (amount * usdtRate) / fxRate;
            else amountUsd = amount;
          } else if (m.currency === "ARS") {
            if (fxRate) amountUsd = amount / fxRate;
          }

          if (amountUsd === null) continue;

          saleAccreditedIncome[saleId] =
            (saleAccreditedIncome[saleId] || 0) + amountUsd;
        }
      }
    }

    const enrichedSales = (salesData || []).map((sale) => {
      const sellerRole = sellerRoleMap[sale.seller_id];
      let commissionUsd = null;
      if (sellerRole === "seller") {
        commissionUsd = (sale.sale_items || []).reduce((sum, it) => {
          const qty = Number(it.quantity || 0);
          const price = Number(it.usd_price || 0);
          const pct = it.commission_pct;
          const fixed = it.commission_fixed;
          if (pct != null) return sum + price * qty * (Number(pct) / 100);
          if (fixed != null) return sum + Number(fixed) * qty;
          return sum;
        }, 0);
      }
      return {
        ...sale,
        accredited_total_usd:
          saleAccreditedIncome[sale.id] ?? Number(sale.total_usd || 0),
        commission_usd: commissionUsd,
      };
    });

    setDetailSales(enrichedSales);
    setDetailLoading(false);
    setDetailDialogOpen(true);
  }, [selectedSalesChannels, fxRate, usdtRate]);

  const availableExportMonths = useMemo(() => {
    return monthlyNetIncome.map((m) => m.month);
  }, [monthlyNetIncome]);

  const openExportDialog = useCallback((format) => {
    setExportFormat(format);
    setExportTargetMonth("");
    setExportDialogOpen(true);
  }, []);

  const loadDetailAndExport = useCallback(
    async (monthKey, format) => {
      const [month, year] = monthKey.split("/");
      const paddedMonth = month.padStart(2, "0");
      const monthStart = `${year}-${paddedMonth}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const monthEnd = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

      let salesQuery = supabase
        .from("sales")
        .select(
          `id,sale_date,total_usd,fx_rate_used,seller_id,sales_channels(name),sale_items(product_name,variant_name,quantity,usd_price,cost_price_usd,subtotal_usd,commission_pct,commission_fixed)`,
        )
        .eq("status", "vendido")
        .is("voided_at", null)
        .gte("sale_date", monthStart)
        .lte("sale_date", monthEnd);

      if (
        selectedSalesChannels.length === 1 &&
        selectedSalesChannels[0] === "none"
      ) {
        salesQuery = salesQuery.is("sales_channel_id", null);
      } else if (selectedSalesChannels.length > 0) {
        const channelIds = selectedSalesChannels
          .filter((channelId) => channelId !== "none")
          .map(Number);

        if (channelIds.length > 0 && selectedSalesChannels.includes("none")) {
          salesQuery = salesQuery.or(
            `sales_channel_id.in.(${channelIds.join(",")}),sales_channel_id.is.null`,
          );
        } else if (channelIds.length > 0) {
          salesQuery = salesQuery.in("sales_channel_id", channelIds);
        }
      }

      salesQuery = salesQuery.order("sale_date", { ascending: false });

      const { data: salesData, error } = await salesQuery;

      if (error) {
        toast.error("No se pudieron cargar las ventas", {
          description: error.message,
        });
        return;
      }

      const saleIds = (salesData || []).map((s) => s.id);
      const uniqueSellerIds = [...new Set((salesData || []).map((s) => s.seller_id).filter(Boolean))];
      const saleAccreditedIncome = {};
      const sellerRoleMap = {};

      if (uniqueSellerIds.length > 0) {
        const { data: sellerUsers } = await supabase
          .from("users")
          .select("id_auth, role")
          .in("id_auth", uniqueSellerIds);

        (sellerUsers || []).forEach((u) => {
          sellerRoleMap[u.id_auth] = u.role;
        });
      }

      if (saleIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from("sale_payments")
          .select("id, sale_id")
          .in("sale_id", saleIds);

        const paymentIds = (paymentsData || []).map((p) => p.id);

        if (paymentIds.length > 0) {
          const { data: incomeMovements } = await supabase
            .from("account_movements")
            .select(
              "amount, currency, related_id, accreditation_status, available_on",
            )
            .eq("type", "income")
            .in("related_table", ["sale_payments", "sale_payment_history"])
            .in("related_id", paymentIds);

          const paymentToSale = new Map(
            (paymentsData || []).map((p) => [p.id, p.sale_id]),
          );
          const today = todayDateKey();

          for (const m of incomeMovements || []) {
            if (
              m.accreditation_status === "pending" &&
              m.available_on &&
              m.available_on > today
            )
              continue;

            const saleId = paymentToSale.get(m.related_id);
            if (!saleId) continue;

            const amount = Number(m.amount || 0);
            if (!amount) continue;

            let amountUsd = null;
            if (m.currency === "USD") {
              amountUsd = amount;
            } else if (m.currency === "USDT") {
              if (usdtRate && fxRate) amountUsd = (amount * usdtRate) / fxRate;
              else amountUsd = amount;
            } else if (m.currency === "ARS") {
              if (fxRate) amountUsd = amount / fxRate;
            }

            if (amountUsd === null) continue;

            saleAccreditedIncome[saleId] =
              (saleAccreditedIncome[saleId] || 0) + amountUsd;
          }
        }
      }

      const enrichedSales = (salesData || []).map((sale) => {
        const sellerRole = sellerRoleMap[sale.seller_id];
        let commissionUsd = null;
        if (sellerRole === "seller") {
          commissionUsd = (sale.sale_items || []).reduce((sum, it) => {
            const qty = Number(it.quantity || 0);
            const price = Number(it.usd_price || 0);
            const pct = it.commission_pct;
            const fixed = it.commission_fixed;
            if (pct != null) return sum + price * qty * (Number(pct) / 100);
            if (fixed != null) return sum + Number(fixed) * qty;
            return sum;
          }, 0);
        }
        return {
          ...sale,
          accredited_total_usd:
            saleAccreditedIncome[sale.id] ?? Number(sale.total_usd || 0),
          commission_usd: commissionUsd,
        };
      });

      const rows = enrichedSales.map((sale) => {
        const items = sale.sale_items || [];
        const labels = items
          .map(
            (it) =>
              `${it.product_name}${it.variant_name ? ` - ${it.variant_name}` : ""} (x${it.quantity})`,
          )
          .join("\n");
        const totalQty = items.reduce(
          (sum, it) => sum + Number(it.quantity || 0),
          0,
        );
        const totalSale = Number(
          sale.accredited_total_usd ?? sale.total_usd ?? 0,
        );
        const totalCost = items.reduce(
          (sum, it) =>
            sum + Number(it.quantity || 0) * Number(it.cost_price_usd ?? 0),
          0,
        );
        const commission = sale.commission_usd != null ? Number(sale.commission_usd.toFixed(2)) : 0;
        const net = totalSale - totalCost - commission;

        return {
          Fecha: new Date(sale.sale_date).toLocaleDateString("es-AR"),
          "Venta ID": sale.id,
          Producto: labels || "-",
          Canal: sale.sales_channels?.name || "-",
          Cantidad: totalQty,
          Cotización: Number(sale.fx_rate_used ?? 0),
          "Total Vta (USD)": totalSale,
          "Costo Total (USD)": totalCost,
          "Comisión (USD)": sale.commission_usd != null
            ? commission
            : "No aplica",
          "Ganancia Neta (USD)": net,
        };
      });

      if (format === "excel") {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Ventas ${monthKey.replace(/\//g, "-")}`);

        ws["!cols"] = [
          { wch: 12 },
          { wch: 10 },
          { wch: 40 },
          { wch: 16 },
          { wch: 10 },
          { wch: 14 },
          { wch: 16 },
          { wch: 16 },
          { wch: 18 },
          { wch: 16 },
        ];

        XLSX.writeFile(wb, `ventas_${monthKey}.xlsx`);
        toast.success("Excel exportado correctamente");
      } else if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape" });

        doc.setFontSize(14);
        doc.text(`Ventas del período ${monthKey}`, 14, 15);

        const tableData = enrichedSales.map((sale) => {
          const items = sale.sale_items || [];
          const labels = items
            .map(
              (it) =>
                `${it.product_name}${it.variant_name ? ` - ${it.variant_name}` : ""} (x${it.quantity})`,
            )
            .join("\n");
          const totalQty = items.reduce(
            (sum, it) => sum + Number(it.quantity || 0),
            0,
          );
          const totalSale = Number(
            sale.accredited_total_usd ?? sale.total_usd ?? 0,
          );
          const totalCost = items.reduce(
            (sum, it) =>
              sum + Number(it.quantity || 0) * Number(it.cost_price_usd ?? 0),
            0,
          );
          const commission = sale.commission_usd != null ? Number(sale.commission_usd.toFixed(2)) : 0;
          const net = totalSale - totalCost - commission;

          return [
            new Date(sale.sale_date).toLocaleDateString("es-AR"),
            `#${sale.id}`,
            labels || "-",
            sale.sales_channels?.name || "-",
            String(totalQty),
            formatCurrency(totalSale, "USD"),
            formatCurrency(totalCost, "USD"),
            sale.commission_usd != null
              ? formatCurrency(sale.commission_usd, "USD")
              : "No aplica",
            formatCurrency(net, "USD"),
          ];
        });

        autoTable(doc, {
          startY: 22,
          head: [
            [
              "Fecha",
              "ID",
              "Producto",
              "Canal",
              "Cant.",
              "Total Vta",
              "Costo",
              "Comisión",
              "Ganancia Neta",
            ],
          ],
          body: tableData,
          theme: "grid",
          headStyles: { fillColor: [16, 185, 129] },
          styles: { fontSize: 7, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 12 },
            2: { cellWidth: 70, overflow: "linebreak" },
            3: { cellWidth: 25 },
            4: { halign: "right", cellWidth: 12 },
            5: { halign: "right", cellWidth: 25 },
            6: { halign: "right", cellWidth: 25 },
            7: { halign: "right", cellWidth: 25 },
            8: { halign: "right", cellWidth: 25 },
          },
        });

        doc.save(`ventas_${monthKey}.pdf`);
        toast.success("PDF exportado correctamente");
      }

      setExportDialogOpen(false);
    },
    [selectedSalesChannels, fxRate, usdtRate],
  );

  const toggleSalesChannelFilter = (channelId) => {
    setSelectedSalesChannels((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  };

  const selectedSalesChannelLabels = useMemo(() => {
    return selectedSalesChannels.map((channelId) => {
      if (channelId === "none") return "Sin canal";
      return (
        salesChannels.find((channel) => String(channel.id) === channelId)
          ?.name || `Canal ${channelId}`
      );
    });
  }, [selectedSalesChannels, salesChannels]);

  const loadFilteredBalances = useCallback(async () => {
    let query = supabase
      .from("account_movements")
      .select(
        "account_id, type, amount, currency, accreditation_status, available_on",
      );

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

  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  useEffect(() => {
    loadMonthlyNetIncome();
  }, [loadMonthlyNetIncome]);

  useEffect(() => {
    loadFilteredBalances();
  }, [loadFilteredBalances]);

  const handleWeekFilter = () => {
    setDateRange({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 }),
    });
  };

  const buildAccountBalances = useCallback(
    (movementsSource) => {
      const totals = new Map();

      movementsSource.forEach((movement) => {
        if (isMovementPendingAccreditation(movement)) return;
        const entry = totals.get(movement.account_id) || {
          income: 0,
          expense: 0,
        };
        if (movement.type === "income")
          entry.income += Number(movement.amount || 0);
        if (movement.type === "expense")
          entry.expense += Number(movement.amount || 0);
        totals.set(movement.account_id, entry);
      });

      return accounts.map((account) => {
        const totalsForAccount = totals.get(account.id) || {
          income: 0,
          expense: 0,
        };
        const currentBalance =
          Number(account.initial_balance || 0) +
          totalsForAccount.income -
          totalsForAccount.expense;

        return {
          ...account,
          income: totalsForAccount.income,
          expense: totalsForAccount.expense,
          current_balance: currentBalance,
        };
      });
    },
    [accounts],
  );

  const accountBalancesAll = useMemo(
    () => buildAccountBalances(balanceMovementsAll),
    [buildAccountBalances, balanceMovementsAll],
  );

  const accountBalancesFiltered = useMemo(
    () => buildAccountBalances(balanceMovementsFiltered),
    [buildAccountBalances, balanceMovementsFiltered],
  );

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

  const pendingAccreditations = useMemo(() => {
    return balanceMovementsAll.reduce(
      (totals, movement) => {
        if (!isMovementPendingAccreditation(movement)) return totals;
        if (movement.type !== "income") return totals;

        const currency = movement.currency || "ARS";
        const amount = Number(movement.amount || 0);
        if (currency === "USD") totals.usd += amount;
        else if (currency === "USDT") totals.usdt += amount;
        else totals.ars += amount;
        return totals;
      },
      { ars: 0, usd: 0, usdt: 0 },
    );
  }, [balanceMovementsAll]);

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
    [fxRate, usdtRate],
  );

  const businessMetrics = useMemo(() => {
    const operatingCashUsd = accountBalancesAll.reduce((total, account) => {
      if (!account.include_in_balance) return total;
      return (
        total + convertAmountToUsd(account.current_balance, account.currency)
      );
    }, 0);

    const referenceCapitalUsd = accountBalancesAll.reduce((total, account) => {
      if (!account.is_reference_capital) return total;
      return (
        total + convertAmountToUsd(account.current_balance, account.currency)
      );
    }, 0);

    return {
      operatingCashUsd,
      referenceCapitalUsd,
      stockCostUsd: stockCostUsd + aftersalesStockCostUsd,
      realResultUsd:
        operatingCashUsd +
        stockCostUsd +
        aftersalesStockCostUsd -
        referenceCapitalUsd,
    };
  }, [
    accountBalancesAll,
    aftersalesStockCostUsd,
    convertAmountToUsd,
    stockCostUsd,
  ]);

  if (!isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-blue-500">
          <CardHeader>
            <CardTitle className="text-white">Balance total ARS</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(totalBalances.ars, "ARS")}
          </CardContent>
        </Card>
        <Card className="bg-green-700">
          <CardHeader>
            <CardTitle className="text-white">Balance total USD</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(totalBalances.usd, "USD")}
          </CardContent>
        </Card>
        <Card className="bg-purple-700">
          <CardHeader>
            <CardTitle className="text-white">Balance total USDT</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(totalBalances.usdt, "USDT")}
          </CardContent>
        </Card>
        <Card className="bg-amber-500">
          <CardHeader>
            <CardTitle className="text-white">
              Pendiente acreditacion ARS
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(pendingAccreditations.ars, "ARS")}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white">Caja operativa USD</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(businessMetrics.operatingCashUsd, "USD")}
          </CardContent>
        </Card>
        <Card className="bg-amber-600">
          <CardHeader>
            <CardTitle className="text-white">Capital referencia USD</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(businessMetrics.referenceCapitalUsd, "USD")}
          </CardContent>
        </Card>
        <Card className="bg-cyan-700">
          <CardHeader>
            <CardTitle className="text-white">Stock al costo USD</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(businessMetrics.stockCostUsd, "USD")}
          </CardContent>
        </Card>
        <Card
          className={
            businessMetrics.realResultUsd >= 0
              ? "bg-emerald-700"
              : "bg-rose-700"
          }
        >
          <CardHeader>
            <CardTitle className="text-white">Resultado real USD</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-white">
            {formatCurrency(businessMetrics.realResultUsd, "USD")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle>Ingresos netos por mes - Ventas concretadas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ingresos por venta menos costo del producto
            </p>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-3">
            <div className="grid gap-1 min-w-[150px]">
              <span className="text-xs text-muted-foreground">Año</span>
              <Select
                value={String(selectedYear)}
                onValueChange={(value) => setSelectedYear(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar año" />
                </SelectTrigger>
                <SelectContent>
                  {salesYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1 min-w-[260px]">
              <span className="text-xs text-muted-foreground">
                Canal de venta
              </span>
              <div className="flex max-w-[360px] flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    selectedSalesChannels.length === 0 ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedSalesChannels([])}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  variant={
                    selectedSalesChannels.includes("none")
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => toggleSalesChannelFilter("none")}
                >
                  Sin canal
                </Button>
                {salesChannels.map((channel) => {
                  const channelId = String(channel.id);
                  const isSelected = selectedSalesChannels.includes(channelId);

                  return (
                    <Button
                      key={channel.id}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleSalesChannelFilter(channelId)}
                    >
                      {channel.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={loadMonthlyNetIncome}
              disabled={monthlyNetIncomeLoading}
            >
              <IconRefresh className="h-4 w-4" />
              {monthlyNetIncomeLoading ? "Actualizando..." : "Actualizar"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openExportDialog("excel")}>
                  <IconTableExport className="mr-2 h-4 w-4" />
                  Exportar como Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openExportDialog("pdf")}>
                  <IconPdf className="mr-2 h-4 w-4" />
                  Exportar como PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {selectedSalesChannelLabels.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-gray-800 px-3 py-2 text-sm text-green-800">
              <span className="font-medium text-white">Canales filtrados:</span>
              {selectedSalesChannelLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">
                    Total de ventas (USD)
                  </TableHead>
                  <TableHead className="text-right">
                    Costo total (USD)
                  </TableHead>
                  <TableHead className="text-right bg-emerald-50/70 text-emerald-800">
                    Ingreso neto (USD)
                  </TableHead>
                  <TableHead className="text-right">
                    Cantidad de ventas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyNetIncome.length > 0 ? (
                  monthlyNetIncome.map((monthData) => (
                    <TableRow
                      key={monthData.month}
                      onClick={() => loadMonthDetail(monthData.month)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">
                        {monthData.month}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(monthData.totalSales, "USD")}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(monthData.totalCost, "USD")}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold bg-emerald-50/50 ${
                          monthData.netIncome >= 0
                            ? "text-emerald-900"
                            : "text-rose-900"
                        }`}
                      >
                        {formatCurrency(monthData.netIncome, "USD")}
                      </TableCell>
                      <TableCell className="text-right">
                        {monthData.salesCount}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No hay datos de ingresos netos disponibles.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Balance por cuenta</CardTitle>
          <Button onClick={loadStaticData} disabled={loading}>
            <IconRefresh className="h-4 w-4" />
            {loading ? "Actualizando..." : "Actualizar"}
          </Button>
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
                        ? `${dateRange.from.toLocaleDateString("es-AR")} - ${dateRange.to.toLocaleDateString("es-AR")}`
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
                    setFilters((current) => ({ ...current, accountId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las cuentas</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name} ({account.currency})
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
                    setFilters((current) => ({ ...current, type: value }))
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
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="bg-sky-50/70 text-sky-800">
                    Saldo inicial
                  </TableHead>
                  <TableHead className="bg-emerald-50/70 text-emerald-800">
                    Ingresos
                  </TableHead>
                  <TableHead className="bg-rose-50/70 text-rose-800">
                    Egresos
                  </TableHead>
                  <TableHead>Balance actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountBalancesFiltered.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>{account.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getCurrencyBadgeClass(account.currency)}
                      >
                        {account.currency}
                      </Badge>
                    </TableCell>
                    <TableCell className="bg-sky-50/50 font-medium text-sky-900">
                      {formatCurrency(
                        account.initial_balance,
                        account.currency,
                      )}
                    </TableCell>
                    <TableCell className="bg-emerald-50/50 font-medium text-emerald-900">
                      {formatCurrency(account.income, account.currency)}
                    </TableCell>
                    <TableCell className="bg-rose-50/50 font-medium text-rose-900">
                      {formatCurrency(account.expense, account.currency)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(
                        account.current_balance,
                        account.currency,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {accountBalancesFiltered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      No hay cuentas disponibles.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[90vw] sm:max-w-3xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Ventas del período {detailMonth}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-full max-h-[65vh]">
            {detailLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Cargando...
              </div>
            ) : detailSales.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                No hay ventas en este mes.
              </div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Venta ID</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Cotización</TableHead>
                      <TableHead className="text-right">Total Vta</TableHead>
                      <TableHead className="text-right">Costo Total</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                      <TableHead className="text-right bg-emerald-50/70 text-emerald-800">
                        Ganancia Neta
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailSales.map((sale) => {
                      const items = sale.sale_items || [];
                      const labels = items
                        .map(
                          (it) =>
                            `${it.product_name}${it.variant_name ? ` - ${it.variant_name}` : ""} (x${it.quantity})`,
                        )
                        .join("\n");
                      const totalQty = items.reduce(
                        (sum, it) => sum + Number(it.quantity || 0),
                        0,
                      );
                      const totalSale = Number(
                        sale.accredited_total_usd ?? sale.total_usd ?? 0,
                      );
                      const totalCost = items.reduce(
                        (sum, it) =>
                          sum +
                          Number(it.quantity || 0) *
                            Number(it.cost_price_usd ?? 0),
                        0,
                      );
                      const commission = sale.commission_usd != null ? Number(sale.commission_usd.toFixed(2)) : 0;
                      const net = totalSale - totalCost - commission;

                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(sale.sale_date).toLocaleDateString(
                              "es-AR",
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            #{sale.id}
                          </TableCell>
                          <TableCell
                            className="max-w-[240px] whitespace-pre-line"
                            title={labels}
                          >
                            {labels || "-"}
                          </TableCell>
                          <TableCell>
                            {sale.sales_channels?.name || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {totalQty}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(
                              Number(sale.fx_rate_used ?? 0),
                              "ARS",
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(totalSale, "USD")}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(totalCost, "USD")}
                          </TableCell>
                          <TableCell className="text-right">
                            {sale.commission_usd != null
                              ? formatCurrency(sale.commission_usd, "USD")
                              : "No aplica"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              net >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {formatCurrency(net, "USD")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Exportar {exportFormat === "excel" ? "Excel" : "PDF"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="grid gap-1">
              <span className="text-sm text-muted-foreground">
                Seleccioná el mes a exportar
              </span>
              <Select
                value={exportTargetMonth}
                onValueChange={setExportTargetMonth}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un mes" />
                </SelectTrigger>
                <SelectContent>
                  {availableExportMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!exportTargetMonth}
              onClick={() =>
                loadDetailAndExport(exportTargetMonth, exportFormat)
              }
            >
              Exportar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
