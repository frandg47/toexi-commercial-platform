"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { IconTrendingUp } from "@tabler/icons-react";
import ConcentricLoader from "./ui/loading";
import { formatPersonName } from "@/utils/formatName";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const getMonthName = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return "-";
  }
};

const currencyFormatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatCurrencyUSD = (value) =>
  value == null || Number.isNaN(Number(value))
    ? "-"
    : currencyFormatterUSD.format(value);

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysToDateKey = (dateKey, days) => {
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  const base = new Date(year, month - 1, day);
  base.setDate(base.getDate() + days);
  return toDateKey(base);
};

const getPeriodRange = (monthFilter) => {
  if (!monthFilter) return null;
  const [year, month] = monthFilter.split("-").map(Number);
  if (!year || !month) return null;
  const start = new Date(year, month - 1, 1);
  const endExclusive = new Date(year, month, 1);
  return { startKey: toDateKey(start), endExclusiveKey: toDateKey(endExclusive) };
};

// ------------------------------
// COMPONENTE GENERAL
// ------------------------------
export default function SellersTop({ viewRole, currentUserRole }) {
  const showCommission = viewRole === "seller";
  const isOwner = currentUserRole === "owner";
  const isSuperadmin = currentUserRole === "superadmin";
  const [topSales, setTopSales] = useState([]);
  const [topCommission, setTopCommission] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);
  const [salesDialogTitle, setSalesDialogTitle] = useState("");
  const [salesDialogItems, setSalesDialogItems] = useState([]);
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    // Defecto: último día del mes actual
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];
  });
  const [availableMonths, setAvailableMonths] = useState([]);

  const handleBarClick = (data) => {
    const sellerId = data?.payload?.seller_id ?? data?.seller_id;
    const sellerName = data?.payload?.seller_name ?? data?.seller_name;
    if (!sellerId) return;
    loadSalesForSeller(sellerId, sellerName);
  };

  // Responsive row height
  const getRowHeight = () => {
    if (typeof window === "undefined") return 55;
    if (window.innerWidth < 480) return 80;
    if (window.innerWidth < 768) return 65;
    return 50;
  };

  const getYAxisWidth = () => {
    if (typeof window === "undefined") return 230;
    if (window.innerWidth < 480) return 40;
    if (window.innerWidth < 768) return 60;
    return 230;
  };

  const [rowHeight, setRowHeight] = useState(getRowHeight());
  const [yAxisWidth, setYAxisWidth] = useState(getYAxisWidth());

  useEffect(() => {
    const onResize = () => {
      setRowHeight(getRowHeight());
      setYAxisWidth(getYAxisWidth());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);


  // --------------------------
  // CARGAR **TOP SELLERS**
  // --------------------------
  const loadTopSales = async () => {
    const period = getPeriodRange(monthFilter);
    const periodStart = period?.startKey;
    const periodEndExclusive = period?.endExclusiveKey;
    // Obtener el período completo basado en period_end
    if (!periodStart || !periodEndExclusive) {
      setTopSales([]);
      return;
    }

    // Obtener todas las ventas en el período filtrado
    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("seller_id")
      .gte("sale_date", periodStart)
      .lt("sale_date", periodEndExclusive)
      .eq("status", "vendido");

    if (salesError) return console.error(salesError);

// Obtener usuarios filtrados por rol (de la vista, no del usuario actual)
    const roleFilter = viewRole === "superadmin" ? "superadmin" : "seller";
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id_auth, name, last_name, avatar_url")
      .eq("role", roleFilter);

    if (usersError) return console.error(usersError);

    // Crear mapa de usuarios
    const usersMap = {};
    const sellerUserIds = new Set();
    users?.forEach(u => {
      usersMap[u.id_auth] = u;
      sellerUserIds.add(u.id_auth);
    });

    // Agrupar por vendedor (solo los del rol correspondiente)
    const sellerData = {};
    sales?.forEach(sale => {
      if (!sale.seller_id) return;
      if (!sellerUserIds.has(sale.seller_id)) return;

      const seller = usersMap[sale.seller_id];
      if (!seller) return;

      if (!sellerData[sale.seller_id]) {
        sellerData[sale.seller_id] = {
          seller_id: sale.seller_id,
          seller_name: formatPersonName(seller.name, seller.last_name),
          avatar_url: seller.avatar_url,
          total_sales: 0,
        };
      }
      sellerData[sale.seller_id].total_sales += 1;
    });

    const sorted = Object.values(sellerData).sort((a, b) => b.total_sales - a.total_sales);

    const formatted = sorted.map((s, i) => ({
      ...s,
      fill: `var(--chart-${(i % 5) + 1})`,
    }));

    setTopSales(formatted);
  };

  const loadSalesForSeller = async (sellerId, sellerName) => {
    const period = getPeriodRange(monthFilter);
    const periodStart = period?.startKey;
    const periodEndExclusive = period?.endExclusiveKey;
    if (!periodStart || !periodEndExclusive) {
      setSalesDialogItems([]);
      setSalesDialogTitle(sellerName || "Ventas");
      setSalesDialogOpen(true);
      return;
    }

    const { data: sales, error } = await supabase
      .from("sales")
      .select(
        "id, sale_date, total_ars, customers(name, last_name), sales_channels(name)"
      )
      .eq("seller_id", sellerId)
      .gte("sale_date", periodStart)
      .lt("sale_date", periodEndExclusive)
      .neq("status", "anulado")
      .order("sale_date", { ascending: false });

    if (error) {
      console.error(error);
      setSalesDialogItems([]);
    } else {
      const saleIds = (sales || []).map((sale) => sale.id).filter(Boolean);

      if (saleIds.length === 0) {
        setSalesDialogItems(sales || []);
      } else {
        const [itemsRes] = await Promise.all([
          supabase
            .from("sale_items")
            .select(
              "sale_id, quantity, usd_price, product_name, variant_name, commission_pct, commission_fixed"
            )
            .in("sale_id", saleIds),
        ]);

        const items = itemsRes?.data || [];
        const saleItemsMap = {};
        const saleCommissionMap = {};

        items.forEach((item) => {
          const qty = Number(item.quantity || 0);
          const usdPrice = Number(item.usd_price || 0);
          const commission = {
            pct: item.commission_pct,
            fixed: item.commission_fixed,
          };
          let itemCommission = 0;

          if (commission.pct != null) {
            itemCommission = usdPrice * qty * (Number(commission.pct) / 100);
          } else if (commission.fixed != null) {
            itemCommission = Number(commission.fixed) * qty;
          }

          if (!saleItemsMap[item.sale_id]) {
            saleItemsMap[item.sale_id] = [];
          }
          saleItemsMap[item.sale_id].push({
            name: item.product_name || "Producto",
            variant: item.variant_name || "",
            quantity: qty,
          });

          saleCommissionMap[item.sale_id] =
            (saleCommissionMap[item.sale_id] || 0) + itemCommission;
        });

        const salesWithDetails = (sales || []).map((sale) => ({
          ...sale,
          items: saleItemsMap[sale.id] || [],
          commission_usd: saleCommissionMap[sale.id] || 0,
        }));

        setSalesDialogItems(salesWithDetails);
      }
    }

    setSalesDialogTitle(sellerName || "Ventas");
    setSalesDialogOpen(true);
  };

  // --------------------------
  // CARGAR **TOP COMMISSIONS**
  // --------------------------
  const loadTopCommission = async () => {
    const period = getPeriodRange(monthFilter);
    const periodStart = period?.startKey;
    const periodEndExclusive = period?.endExclusiveKey;
    if (!periodStart || !periodEndExclusive) {
      setTopCommission([]);
      return;
    }

    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("id, seller_id")
      .gte("sale_date", periodStart)
      .lt("sale_date", periodEndExclusive)
      .eq("status", "vendido");

    if (salesError) return console.error(salesError);

    const saleIds = (sales || []).map((sale) => sale.id).filter(Boolean);
    if (saleIds.length === 0) {
      setTopCommission([]);
      return;
    }

    const { data: items, error: itemsError } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, usd_price, commission_pct, commission_fixed")
      .in("sale_id", saleIds);

    if (itemsError) return console.error(itemsError);

    // Obtener usuarios filtrados por rol (solo sellers para comisiones)
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id_auth, name, last_name, avatar_url")
      .eq("role", "seller");

    if (usersError) return console.error(usersError);

    // Crear mapa de usuarios (filtrados por rol)
    const usersMap = {};
    const sellerUserIds = new Set();
    users?.forEach(u => {
      usersMap[u.id_auth] = u;
      sellerUserIds.add(u.id_auth);
    });

    const saleSellerMap = {};
    sales?.forEach((sale) => {
      if (sale?.id) saleSellerMap[sale.id] = sale.seller_id;
    });

    // Agrupar comisiones por vendedor (solo los del rol correspondiente)
    const commissionsByVendor = {};
    (items || []).forEach((item) => {
      const sellerId = saleSellerMap[item.sale_id];
      if (!sellerId) return;
      if (!sellerUserIds.has(sellerId)) return;
      const seller = usersMap[sellerId];
      if (!seller) return;

      if (!commissionsByVendor[sellerId]) {
        commissionsByVendor[sellerId] = {
          seller_id: sellerId,
          seller_name: formatPersonName(seller.name, seller.last_name),
          avatar_url: seller.avatar_url,
          total_commission: 0,
        };
      }

      const qty = Number(item.quantity || 0);
      const usdPrice = Number(item.usd_price || 0);
      const pct = item.commission_pct;
      const fixed = item.commission_fixed;
      let itemCommission = 0;

      if (pct != null) {
        itemCommission = usdPrice * qty * (Number(pct) / 100);
      } else if (fixed != null) {
        itemCommission = Number(fixed) * qty;
      }

      commissionsByVendor[sellerId].total_commission += itemCommission;
    });

    const sorted = Object.values(commissionsByVendor)
      .filter(commission => commission.total_commission > 0)
      .sort(
        (a, b) => b.total_commission - a.total_commission
      );

    const formatted = sorted.map((s, i) => ({
      ...s,
      fill: `var(--chart-${(i % 5) + 1})`,
    }));

    setTopCommission(formatted);
  };

  // --------------------------
  // CARGA INICIAL (limpia y correcta)
  // --------------------------
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await loadTopSales();
      await loadTopCommission();

      // Obtener todos los meses disponibles
      const { data: allSales, error } = await supabase
        .from("sales")
        .select("sale_date")
        .neq("status", "anulado")
        .order("sale_date", { ascending: false })
        .limit(500);

      if (!error && allSales) {
        const uniqueMonths = new Set();
        allSales.forEach((sale) => {
          if (!sale?.sale_date) return;
          const date = new Date(sale.sale_date);
          if (Number.isNaN(date.getTime())) return;
          const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
          uniqueMonths.add(toDateKey(monthEnd));
        });
        const uniqueMonthsList = Array.from(uniqueMonths).sort(
          (a, b) => new Date(b) - new Date(a)
        );
        setAvailableMonths(uniqueMonthsList);
        if (uniqueMonthsList.length > 0 && !uniqueMonthsList.includes(monthFilter)) {
          setMonthFilter(uniqueMonthsList[0]);
        }
      }

      setLoading(false);
    };

    loadAll();
  }, [monthFilter]);

  // --------------------------
  // FUNCIÓN PARA RENDER TICKS
  // --------------------------
  const renderTick = (data, payload, y) => {
    const seller = data.find((s) => s.seller_name === payload.value);
    if (!seller) return null;

    return (
      <foreignObject y={y - 18} width={220} height={36}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <img
            src={seller.avatar_url}
            alt={seller.seller_name}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />

          <span className="hidden md:inline">{seller.seller_name}</span>
        </div>
      </foreignObject>
    );
  };

  // --------------------------
  // LOADER GLOBAL
  // --------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-100">
        <ConcentricLoader />
      </div>
    );
  }

  // --------------------------
  // RENDER
  // --------------------------
  return (
    <div className="space-y-10">
      {/* Filtro de mes */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Filtrar por Mes</h2>
          <p className="text-sm text-muted-foreground">Selecciona un período para ver el ranking</p>
        </div>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full lg:w-56">
            <SelectValue placeholder="Filtrar por mes" />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((month) => (
              <SelectItem key={month} value={month}>
                {getMonthName(month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* -------------------------------------------------- */}
      {/* 1) RANKING POR VENTAS */}
      {/* -------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>
            {showCommission
              ? "Ranking: Cantidad de ventas"
              : "Ranking: Ventas"}
          </CardTitle>
          <CardDescription>
            {showCommission
              ? "Vendedores con más ventas completadas"
              : "Ventas de vendedores presenciales"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ChartContainer
            config={{}}
            style={{ height: `${topSales.length * rowHeight}px`, width: "100%" }}
          >
            <BarChart data={topSales} layout="vertical" barSize={32}>
              <YAxis
                dataKey="seller_name"
                type="category"
                width={yAxisWidth}
                tickLine={false}
                axisLine={false}
                tick={(props) => renderTick(topSales, props.payload, props.y)}
              />
              <XAxis type="number" hide />

              <ChartTooltip
                cursor={{ fill: "rgba(0,0,0,0.06)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <>
                        <span className="text-muted-foreground">Ventas:</span>
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {value.toLocaleString("es-AR")}
                        </span>
                      </>
                    )}
                  />
                }
              />

              <Bar
                dataKey="total_sales"
                radius={6}
                onClick={handleBarClick}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>

        <CardFooter className="flex-col items-start gap-2 text-sm">
          <div className="flex gap-2 leading-none font-medium">
            {showCommission
              ? "Cantidad de ventas completadas por vendedor en el mes filtrado"
              : "Cantidad de ventas por vendedor presencial"}
            <IconTrendingUp className="h-4 w-4" />
          </div>
          <div className="text-muted-foreground leading-none">
            Mostrando la cantidad total de ventas para el período filtrado
          </div>
        </CardFooter>
      </Card>

{/* -------------------------------------------------- */}
      {/* 2) RANKING POR COMISIONES */}
      {/* -------------------------------------------------- */}
      {showCommission ? (
      <Card>
        <CardHeader>
          <CardTitle>
            {isOwner || isSuperadmin
              ? "Ranking: Comisiones Ganadas"
              : "Mis Comisiones"}
          </CardTitle>
          <CardDescription>
            {isOwner || isSuperadmin
              ? "Vendedores que más dinero generaron"
              : "Comisiones generadas en el mes actual"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ChartContainer
            config={{}}
            style={{ height: `${topCommission.length * rowHeight}px`, width: "100%" }}
          >
            <BarChart data={topCommission} layout="vertical" barSize={32}>
              <YAxis
                dataKey="seller_name"
                type="category"
                width={yAxisWidth}
                tickLine={false}
                axisLine={false}
                tick={(props) => renderTick(topCommission, props.payload, props.y)}
              />
              <XAxis type="number" hide />

              <ChartTooltip
                cursor={{ fill: "rgba(0,0,0,0.06)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <>
                        <span className="text-muted-foreground">Comisión:</span>
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          US$ {value.toLocaleString("es-AR")}
                        </span>
                      </>
                    )}
                  />
                }
              />

              <Bar
                dataKey="total_commission"
                radius={6}
                onClick={handleBarClick}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>

        <CardFooter className="flex-col items-start gap-2 text-sm">
          <div className="flex gap-2 leading-none font-medium">
            {isOwner || isSuperadmin
              ? "Comisiones generadas por vendedor en el mes filtrado"
              : "Comisiones generadas en el mes filtrado"}
            <IconTrendingUp className="h-4 w-4" />
          </div>
          <div className="text-muted-foreground leading-none">
            Mostrando las comisiones ganadas totales para el período filtrado
          </div>
        </CardFooter>
      </Card>
      ) : null}

      <Dialog open={salesDialogOpen} onOpenChange={setSalesDialogOpen}>
        <DialogContent className="min-w-6xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{salesDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venta #</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesDialogItems.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">#{sale.id}</TableCell>
                    <TableCell>
                      {new Date(sale.sale_date).toLocaleDateString("es-AR")}
                    </TableCell>
                    <TableCell>
                      {sale.customers
                        ? formatPersonName(
                            sale.customers.name,
                            sale.customers.last_name
                          )
                        : "Sin cliente"}
                      </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {sale.items?.length
                          ? sale.items.map((item, index) => (
                              <div key={`${sale.id}-item-${index}`}>
                                {item.name}
                                {item.variant ? ` (${item.variant})` : ""} x{item.quantity}
                              </div>
                            ))
                          : "Sin productos"}
                      </div>
                    </TableCell>
                    <TableCell>{sale.sales_channels?.name || "-"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyUSD(sale.commission_usd || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(sale.total_ars || 0).toLocaleString("es-AR")}
                    </TableCell>
                  </TableRow>
                ))}
                {salesDialogItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No hay ventas en el periodo seleccionado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
