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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
} from "recharts";
import { toast } from "sonner";

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

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function FinanceReport() {
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [salesYears, setSalesYears] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [expensesByCategory, setExpensesByCategory] = useState([]);
  const [cashFlow, setCashFlow] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [totals, setTotals] = useState({ income: 0, expenses: 0, net: 0 });

  useEffect(() => {
    const fetchYears = async () => {
      const { data } = await supabase
        .from("sales")
        .select("sale_date")
        .eq("status", "vendido")
        .is("voided_at", null);

      const years = [...new Set((data || []).map((s) => new Date(s.sale_date).getFullYear()))].sort((a, b) => b - a);
      setSalesYears(years.length ? years : [new Date().getFullYear()]);
    };
    fetchYears();
  }, []);

  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      const [
        { data: salesData },
        { data: expensesData },
        { data: movementsData },
        { data: topCustomersData },
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("id, sale_date, total_ars, total_usd, status")
          .eq("status", "vendido")
          .is("voided_at", null)
          .gte("sale_date", yearStart)
          .lte("sale_date", yearEnd),
        supabase
          .from("expenses")
          .select("id, amount, currency, category, expense_date, type")
          .gte("expense_date", yearStart)
          .lte("expense_date", yearEnd)
          .eq("is_active", true),
        supabase
          .from("account_movements")
          .select("id, type, amount, currency, movement_date")
          .gte("movement_date", yearStart)
          .lte("movement_date", yearEnd),
        supabase
          .from("sales")
          .select(`
            id, total_ars,
            customer:customers(id, name, last_name, phone, email)
          `)
          .eq("status", "vendido")
          .is("voided_at", null)
          .gte("sale_date", yearStart)
          .lte("sale_date", yearEnd),
      ]);

      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

      const salesByMonth = {};
      const incomeByMonth = {};
      (salesData || []).forEach((sale) => {
        const month = new Date(sale.sale_date).getMonth();
        salesByMonth[month] = (salesByMonth[month] || 0) + Number(sale.total_ars || 0);
      });

      (movementsData || [])
        .filter((m) => m.type === "income")
        .forEach((m) => {
          const month = new Date(m.movement_date).getMonth();
          const amount = m.currency === "ARS" ? Number(m.amount || 0) : 0;
          incomeByMonth[month] = (incomeByMonth[month] || 0) + amount;
        });

      const expensesByMonth = {};
      (expensesData || []).forEach((exp) => {
        const month = new Date(exp.expense_date).getMonth();
        const amount = exp.currency === "ARS" ? Number(exp.amount || 0) : 0;
        expensesByMonth[month] = (expensesByMonth[month] || 0) + amount;
      });

      let totalIncome = 0;
      let totalExpenses = 0;
      const monthly = monthNames.map((name, i) => {
        const income = incomeByMonth[i] || salesByMonth[i] || 0;
        const expense = expensesByMonth[i] || 0;
        totalIncome += income;
        totalExpenses += expense;
        return { name, income, expense, net: income - expense };
      });
      setMonthlyData(monthly);
      setTotals({ income: totalIncome, expenses: totalExpenses, net: totalIncome - totalExpenses });

      const catMap = {};
      (expensesData || []).forEach((exp) => {
        const cat = exp.category || "Sin categoría";
        const amount = exp.currency === "ARS" ? Number(exp.amount || 0) : 0;
        catMap[cat] = (catMap[cat] || 0) + amount;
      });
      const catData = Object.entries(catMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      setExpensesByCategory(catData);

      let accumulated = 0;
      const flow = monthNames.map((name, i) => {
        const income = incomeByMonth[i] || salesByMonth[i] || 0;
        const expense = expensesByMonth[i] || 0;
        accumulated += income - expense;
        return { name, income, expense, accumulated };
      });
      setCashFlow(flow);

      const customerMap = {};
      (topCustomersData || []).forEach((sale) => {
        if (!sale.customer) return;
        const key = sale.customer.id;
        if (!customerMap[key]) {
          customerMap[key] = {
            id: key,
            name: `${sale.customer.name || ""} ${sale.customer.last_name || ""}`.trim(),
            phone: sale.customer.phone || "",
            email: sale.customer.email || "",
            totalSpent: 0,
            purchaseCount: 0,
          };
        }
        customerMap[key].totalSpent += Number(sale.total_ars || 0);
        customerMap[key].purchaseCount += 1;
      });
      const topList = Object.values(customerMap)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 15);
      setTopCustomers(topList);

      setLoading(false);
    };

    loadReport();
  }, [selectedYear]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Año:</span>
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {salesYears.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">Ingresos totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-800">{formatARS(totals.income)}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-700">Gastos totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-800">{formatARS(totals.expenses)}</div>
          </CardContent>
        </Card>
        <Card className={totals.net >= 0 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm ${totals.net >= 0 ? "text-blue-700" : "text-amber-700"}`}>
              Resultado neto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.net >= 0 ? "text-blue-800" : "text-amber-800"}`}>
              {formatARS(totals.net)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos vs Gastos por mes</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v) => formatARS(v)} />
              <Legend />
              <Bar dataKey="income" name="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Flujo de caja mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Legend />
                <Bar dataKey="income" name="Entradas" fill="#22c55e" opacity={0.6} />
                <Bar dataKey="expense" name="Salidas" fill="#ef4444" opacity={0.6} />
                <Line type="monotone" dataKey="accumulated" name="Saldo acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desglose de gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={groupSmallSlices(expensesByCategory, "value", 3)}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {groupSmallSlices(expensesByCategory, "value", 3).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatARS(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin gastos registrados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mejores clientes</CardTitle>
          <p className="text-sm text-muted-foreground">Clientes con mayores compras en el año</p>
        </CardHeader>
        <CardContent>
          {topCustomers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">Total gastado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c, idx) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.phone || c.email || "—"}</TableCell>
                      <TableCell className="text-sm text-right">{c.purchaseCount}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{formatARS(c.totalSpent)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No hay ventas registradas</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
