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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { IconSearch, IconAlertTriangle } from "@tabler/icons-react";

const COLORS = [
  "#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8",
  "#82ca9d", "#ffc658", "#8dd1e1", "#a4de6c", "#d0ed57",
];

const groupSmallSlices = (data, valueKey, threshold = 3) => {
  const total = data.reduce((acc, item) => acc + Number(item[valueKey] || 0), 0);
  if (total === 0) return data;
  const main = [];
  let otherValue = 0;
  data.forEach((item) => {
    const pct = (Number(item[valueKey]) / total) * 100;
    if (pct >= threshold) {
      main.push(item);
    } else {
      otherValue += Number(item[valueKey] || 0);
    }
  });
  if (otherValue > 0) {
    main.push({ name: "Otros", [valueKey]: otherValue });
  }
  return main;
};

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function InventoryReport() {
  const [loading, setLoading] = useState(true);
  const [variants, setVariants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadInventory = async () => {
      setLoading(true);

      const { data: variantsData } = await supabase
        .from("product_variants")
        .select(`
          id, variant_name, color, stock, usd_price, cost_price_usd,
          product:products(id, name, categories(name))
        `)
        .eq("active", true);

      const enriched = (variantsData || []).map((v) => ({
        ...v,
        categoryName: v.product?.categories?.name || "Sin categoría",
        productName: v.product?.name || "—",
        totalCost: (Number(v.stock) || 0) * (Number(v.cost_price_usd) || 0),
        totalValue: (Number(v.stock) || 0) * (Number(v.usd_price) || 0),
      }));

      setVariants(enriched);

      const catMap = {};
      enriched.forEach((v) => {
        const cat = v.categoryName;
        if (!catMap[cat]) catMap[cat] = { name: cat, totalStock: 0, totalValue: 0, count: 0 };
        catMap[cat].totalStock += Number(v.stock) || 0;
        catMap[cat].totalValue += v.totalCost;
        catMap[cat].count += 1;
      });
      setCategories(Object.values(catMap).sort((a, b) => b.totalValue - a.totalValue));

      setLoading(false);
    };

    loadInventory();
  }, []);

  const totalStock = useMemo(() => variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0), [variants]);
  const totalValue = useMemo(() => variants.reduce((acc, v) => acc + v.totalCost, 0), [variants]);
  const totalProducts = useMemo(() => {
    const ids = new Set(variants.map((v) => v.product?.id).filter(Boolean));
    return ids.size;
  }, [variants]);

  const lowStockItems = useMemo(
    () => variants.filter((v) => (Number(v.stock) || 0) > 0 && (Number(v.stock) || 0) <= lowStockThreshold),
    [variants, lowStockThreshold]
  );

  const outOfStockItems = useMemo(
    () => variants.filter((v) => (Number(v.stock) || 0) === 0),
    [variants]
  );

  const filteredVariants = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return variants.filter(
      (v) =>
        v.productName.toLowerCase().includes(q) ||
        (v.variant_name || "").toLowerCase().includes(q) ||
        (v.color || "").toLowerCase().includes(q)
    );
  }, [variants, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-sky-50 border-sky-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-sky-700">Stock total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-800">{totalStock.toLocaleString("es-AR")} u.</div>
            <p className="text-xs text-muted-foreground mt-1">{totalProducts} productos</p>
          </CardContent>
        </Card>
        <Card className="bg-cyan-50 border-cyan-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-cyan-700">Valor del inventario (costo)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-800">{formatUSD(totalValue)}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
              <IconAlertTriangle className="h-4 w-4" />
              Stock bajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-800">{lowStockItems.length + outOfStockItems.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {outOfStockItems.length} sin stock · {lowStockItems.length} por debajo del umbral
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categories}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="totalStock" name="Unidades" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valor por categoría (costo USD)</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={groupSmallSlices(categories, "totalValue", 3)}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="totalValue"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {groupSmallSlices(categories, "totalValue", 3).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatUSD(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconAlertTriangle className="h-5 w-5 text-amber-500" />
            Productos con stock bajo
          </CardTitle>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">Umbral:</span>
            <Input
              type="number"
              min="1"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Number(e.target.value) || 5)}
              className="w-20"
            />
          </div>
        </CardHeader>
        <CardContent>
          {lowStockItems.length + outOfStockItems.length > 0 ? (
            <div className="rounded-md border max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Precio USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...outOfStockItems, ...lowStockItems].map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-sm font-medium">{v.productName}</TableCell>
                      <TableCell className="text-sm">{v.variant_name || "—"}</TableCell>
                      <TableCell className="text-sm">{v.color || "—"}</TableCell>
                      <TableCell className="text-sm text-right">
                        <Badge variant={v.stock === 0 ? "destructive" : "outline"}>
                          {v.stock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right">{formatUSD(v.usd_price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Todos los productos tienen stock suficiente</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buscar producto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, variante o color..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filteredVariants.length > 0 && (
            <div className="rounded-md border max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Costo USD</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVariants.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-sm font-medium">{v.productName}</TableCell>
                      <TableCell className="text-sm">{v.variant_name || "—"}</TableCell>
                      <TableCell className="text-sm">{v.color || "—"}</TableCell>
                      <TableCell className="text-sm">{v.categoryName}</TableCell>
                      <TableCell className="text-sm text-right">{v.stock}</TableCell>
                      <TableCell className="text-sm text-right">{formatUSD(v.cost_price_usd)}</TableCell>
                      <TableCell className="text-sm text-right">{formatUSD(v.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {search && filteredVariants.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
