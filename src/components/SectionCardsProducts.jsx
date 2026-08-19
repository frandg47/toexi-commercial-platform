import { useState, useEffect, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconHomeDollar, IconUserCheck, IconUsers } from "@tabler/icons-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export default function SectionCardsProducts() {
  const COLORS = [
    "#A7F3D0",
    "#6EE7B7",
    "#34D399",
    "#10B981",
    "#059669",
    "#047857",
    "#065F46",
    "#D1FAE5",
    "#22C55E",
    "#16A34A",
  ];

  const [fxRate, setFxRate] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [rateDiff, setRateDiff] = useState(null);
  const [categoriesData, setCategoriesData] = useState([]);
  const [activeSellersCount, setActiveSellersCount] = useState(0);
  const [sellersWithSalesCount, setSellersWithSalesCount] = useState(0); // 🟢 nuevo estado
  const [loading, setLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1️⃣ Obtener la cotización activa
      const { data: fxActive, error: fxActiveError } = await supabase
        .from("fx_rates")
        .select("id, source, rate, is_active, created_at")
        .eq("is_active", true)
        .eq("source", "blue")
        .limit(1);

      if (fxActiveError) throw fxActiveError;
      if (!fxActive || fxActive.length === 0) {
        toast.info("No hay cotización activa.");
        setLoading(false);
        return;
      }

      const active = fxActive[0];
      setFxRate(Number(active.rate));
      setLastUpdate(new Date(active.created_at));

      // 2️⃣ Buscar la cotización anterior del mismo source
      const { data: fxPrev, error: fxPrevError } = await supabase
        .from("fx_rates")
        .select("id, source, rate, is_active, created_at")
        .eq("source", active.source)
        .eq("is_active", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (fxPrevError) throw fxPrevError;

      if (fxPrev?.length > 0) {
        const prev = fxPrev[0];
        const diff =
          ((Number(active.rate) - Number(prev.rate)) / Number(prev.rate)) * 100;
        setRateDiff(diff);
      } else {
        setRateDiff(null);
      }

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // 3️⃣ Traer categorías
      const { data: categories, error: catError } = await supabase
        .from("categories")
        .select("id, name");
      if (catError) throw catError;

      // 4️⃣ Traer productos con variantes
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select(
          `
        id,
        category_id,
        active,
        usd_price,
        product_variants (id, stock)
      `,
        );
      if (prodError) throw prodError;

      // 5️⃣ Calcular cantidad de productos por categoría
      const counts = categories.map((cat) => {
        const productsInCat = (products || []).filter(
          (p) => p.category_id === cat.id && p.active === true
        );
        return { name: cat.name, value: productsInCat.length };
      });

      setCategoriesData(counts.filter((item) => item.value > 0));

      // 6) Vendedores activos
      const { count: activeSellersCount } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "seller")
        .eq("is_active", true);

      setActiveSellersCount(activeSellersCount || 0);

      // 7) Vendedores con ventas en el mes actual
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("seller_id, sale_date, status")
        .gte("sale_date", periodStart.toISOString())
        .lte("sale_date", periodEnd.toISOString())
        .eq("status", "vendido");

      if (salesError) throw salesError;

      const sellersWithSales = new Set(
        (sales || []).map((s) => s.seller_id).filter(Boolean),
      );
      setSellersWithSalesCount(sellersWithSales.size);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar datos", {
        description:
          err.message ||
          "Ocurrió un error al cargar la información del dashboard.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatDate = (date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const getRateBadge = () => {
    if (rateDiff === null) return null;
    const diffAbs = Math.abs(rateDiff).toFixed(2);
    if (rateDiff > 0)
      return (
        <Badge variant="outline" className="text-green-600">
          ▲ +{diffAbs}%
        </Badge>
      );
    if (rateDiff < 0)
      return (
        <Badge variant="outline" className="text-red-600">
          ▼ {diffAbs}%
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-gray-600">
        = 0%
      </Badge>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
      {/* 🔹 Columna izquierda */}
      <div className="flex flex-col gap-4">
        {/* Card 1: Cotización */}
        <Card className="flex-1 flex flex-col justify-between relative">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconHomeDollar className="text-green-500" />
              Cotización actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold flex items-center gap-3">
              {fxRate ? `$${fxRate.toLocaleString("es-AR")}` : "-"}
              {getRateBadge()}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">USD → ARS</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Última actualización: {formatDate(lastUpdate)}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          {/* Card 2: Vendedores activos */}
          <Card className="flex-1 flex flex-col justify-between relative">
            <CardHeader>
              <CardDescription>Vendedores activos</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {/* <IconUsers className="text-emerald-600" /> */}
                {loading ? "--" : activeSellersCount}
              </CardTitle>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="flex gap-2 font-medium">
                Usuarios habilitados para vender
                <IconUsers className="" />
              </div>
              <div className="text-muted-foreground">
                Incluye vendedores con y sin ventas este mes
              </div>
            </CardFooter>
          </Card>

          {/* Card 3: Vendieron este mes */}
          <Card className="flex-1 flex flex-col justify-between relative">
            <CardHeader>
              <CardDescription>Vendieron este mes</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {loading ? "--" : sellersWithSalesCount}
              </CardTitle>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="flex gap-2 font-medium">
                Vendedores con ventas registradas
                <IconUserCheck className="" />
              </div>
              <div className="text-muted-foreground">
                Vendedores que realizaron al menos una venta
                durante el mes actual
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* 🔹 Columna derecha (gráfico) */}
      <Card className="flex flex-col justify-center">
        <CardHeader>
          <CardTitle>Distribución por categoría</CardTitle>
          <CardDescription>Cantidad de productos por categoría</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center flex-1">
          {loading ? (
            <p className="text-muted-foreground">Cargando gráfico...</p>
          ) : (
            <div className="w-full pb-3 h-[280px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoriesData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius="80%"
                    label
                  >
                    {categoriesData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" />
                  <ChartTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
