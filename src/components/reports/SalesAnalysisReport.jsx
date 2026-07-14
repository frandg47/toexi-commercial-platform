import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  IconTrendingUp,
  IconTrendingDown,
  IconClock,
  IconCalendar,
} from "@tabler/icons-react";
import { subDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

const PERIOD_OPTIONS = [
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "1 año", days: 365 },
  { label: "Personalizado", days: null },
];

export default function SalesAnalysisReport() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stagnantDays, setStagnantDays] = useState(30);

  const [saleItems, setSaleItems] = useState([]);
  const [variants, setVariants] = useState([]);
  const [lastSalesByVariant, setLastSalesByVariant] = useState({});

  const dateRange = useMemo(() => {
    if (customFrom && customTo && period === null) {
      return { from: customFrom, to: customTo };
    }
    const now = new Date();
    return {
      from: format(subDays(now, period || 30), "yyyy-MM-dd"),
      to: format(now, "yyyy-MM-dd"),
    };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: items }, { data: vars }] = await Promise.all([
        supabase
          .from("sale_items")
          .select(`
            product_name, variant_id, quantity, usd_price,
            sales!inner(sale_date, status, voided_at)
          `)
          .eq("sales.status", "vendido")
          .is("sales.voided_at", null)
          .gte("sales.sale_date", dateRange.from)
          .lte("sales.sale_date", dateRange.to),
        supabase
          .from("product_variants")
          .select(`
            id, variant_name, color, stock, usd_price,
            product:products(name)
          `)
          .eq("active", true),
      ]);

      setSaleItems(items || []);
      setVariants(
        (vars || []).map((v) => ({
          ...v,
          productName: v.product?.name || "—",
        }))
      );

      const variantIds = [
        ...new Set((items || []).map((i) => i.variant_id).filter(Boolean)),
      ];

      if (variantIds.length > 0) {
        const { data: allSales } = await supabase
          .from("sale_items")
          .select(`
            variant_id,
            sales!inner(sale_date, status, voided_at)
          `)
          .in("variant_id", variantIds)
          .eq("sales.status", "vendido")
          .is("sales.voided_at", null);

        const lastMap = {};
        (allSales || []).forEach((si) => {
          const vid = si.variant_id;
          const date = si.sales?.sale_date;
          if (!date) return;
          if (!lastMap[vid] || date > lastMap[vid]) {
            lastMap[vid] = date;
          }
        });
        setLastSalesByVariant(lastMap);
      }

      setLoading(false);
    };

    load();
  }, [dateRange]);

  const productSales = useMemo(() => {
    const map = {};
    saleItems.forEach((item) => {
      const name = item.product_name || "—";
      if (!map[name]) map[name] = { name, quantity: 0, revenue: 0 };
      map[name].quantity += Number(item.quantity) || 0;
      map[name].revenue += (Number(item.quantity) || 0) * (Number(item.usd_price) || 0);
    });
    return Object.values(map);
  }, [saleItems]);

  const topProducts = useMemo(
    () => [...productSales].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    [productSales]
  );

  const bottomProducts = useMemo(
    () =>
      [...productSales]
        .filter((p) => p.quantity > 0)
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 10),
    [productSales]
  );

  const totalUnits = useMemo(
    () => productSales.reduce((acc, p) => acc + p.quantity, 0),
    [productSales]
  );

  const totalRevenue = useMemo(
    () => productSales.reduce((acc, p) => acc + p.revenue, 0),
    [productSales]
  );

  const topProduct = topProducts.length > 0 ? topProducts[0] : null;

  const stagnantVariants = useMemo(() => {
    const now = new Date();
    return variants
      .filter((v) => {
        if ((Number(v.stock) || 0) === 0) return false;
        const lastSale = lastSalesByVariant[v.id];
        if (!lastSale) return true;
        const diff = (now - new Date(lastSale)) / (1000 * 60 * 60 * 24);
        return diff > stagnantDays;
      })
      .map((v) => {
        const lastSale = lastSalesByVariant[v.id];
        const daysWithoutSale = lastSale
          ? Math.floor((now - new Date(lastSale)) / (1000 * 60 * 60 * 24))
          : null;
        return { ...v, lastSale, daysWithoutSale };
      })
      .sort((a, b) => {
        if (a.daysWithoutSale === null) return -1;
        if (b.daysWithoutSale === null) return 1;
        return b.daysWithoutSale - a.daysWithoutSale;
      });
  }, [variants, lastSalesByVariant, stagnantDays]);

  const top5Chart = useMemo(() => topProducts.slice(0, 5), [topProducts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <IconCalendar className="h-4 w-4 text-muted-foreground" />
        {PERIOD_OPTIONS.map((opt) => (
          <Button
            key={opt.label}
            variant={period === opt.days ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(opt.days)}
          >
            {opt.label}
          </Button>
        ))}
        {period === null && (
          <div className="flex items-center gap-2 ml-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-36"
            />
            <span className="text-muted-foreground">a</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-36"
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700">Unidades vendidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-800">{totalUnits.toLocaleString("es-AR")}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">Ingresos totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-800">{formatUSD(totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card className="bg-violet-50 border-violet-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-violet-700 flex items-center gap-1">
              <IconTrendingUp className="h-4 w-4" />
              Más vendido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-violet-800 truncate">{topProduct?.name || "—"}</div>
            {topProduct && (
              <p className="text-xs text-muted-foreground mt-1">{topProduct.quantity} u. vendidas</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-1">
              <IconClock className="h-4 w-4" />
              Sin movimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-800">{stagnantVariants.length}</div>
            <p className="text-xs text-muted-foreground mt-1">variantes con stock estancado</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTrendingUp className="h-5 w-5 text-green-500" />
              Top 5 productos más vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top5Chart.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={top5Chart} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Unidades" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este período</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTrendingDown className="h-5 w-5 text-red-500" />
              Productos con menos salida
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottomProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={bottomProducts.slice(0, 5)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Unidades" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este período</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Detalle: productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <div className="rounded-md border max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((p, i) => (
                      <TableRow key={p.name}>
                        <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-right">{p.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{formatUSD(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalle: productos menos vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {bottomProducts.length > 0 ? (
              <div className="rounded-md border max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bottomProducts.map((p, i) => (
                      <TableRow key={p.name}>
                        <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-right">{p.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{formatUSD(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconClock className="h-5 w-5 text-amber-500" />
            Variantes con stock sin movimiento
          </CardTitle>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">Días sin venta:</span>
            <Input
              type="number"
              min="1"
              value={stagnantDays}
              onChange={(e) => setStagnantDays(Number(e.target.value) || 30)}
              className="w-20"
            />
          </div>
        </CardHeader>
        <CardContent>
          {stagnantVariants.length > 0 ? (
            <div className="rounded-md border max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Precio USD</TableHead>
                    <TableHead>Última venta</TableHead>
                    <TableHead className="text-right">Días sin salida</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stagnantVariants.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-sm font-medium">{v.productName}</TableCell>
                      <TableCell className="text-sm">{v.variant_name || "—"}</TableCell>
                      <TableCell className="text-sm">{v.color || "—"}</TableCell>
                      <TableCell className="text-sm text-right">{v.stock}</TableCell>
                      <TableCell className="text-sm text-right">{formatUSD(v.usd_price)}</TableCell>
                      <TableCell className="text-sm">
                        {v.lastSale
                          ? format(parseISO(v.lastSale), "dd MMM yyyy", { locale: es })
                          : "Nunca"}
                      </TableCell>
                      <TableCell className="text-sm text-right">
                        <Badge variant={v.daysWithoutSale === null ? "destructive" : "outline"}>
                          {v.daysWithoutSale === null ? "Nunca vendido" : `${v.daysWithoutSale} días`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todas las variantes con stock tienen salida reciente
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
