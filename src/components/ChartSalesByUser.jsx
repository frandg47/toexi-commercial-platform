"use client";

import * as React from "react";
import { AreaChart, Area, CartesianGrid, XAxis, Tooltip } from "recharts";
import { supabase } from "../lib/supabaseClient";
import ConcentricLoader from "./ui/loading";

export function ChartSalesByUser() {
  const [salesData, setSalesData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("sales")
      .select("total, sale_date, user_id");

    if (error) {
      console.error("Error fetching sales:", error);
      setLoading(false);
      return;
    }

    // Agrupar ventas por usuario
    const grouped = {};
    data.forEach((sale) => {
      const user = sale.users?.email || "Unknown"; // Evitar undefined
      if (!grouped[user]) grouped[user] = [];
      grouped[user].push({ date: sale.sale_date, amount: sale.total });
    });

    // Obtener todas las fechas únicas
    const allDates = Array.from(
      new Set(data.map((s) => s.sale_date.split("T")[0]))
    ).sort();

    // Transformar para Recharts
    const chartData = allDates.map((date) => {
      const dayData = { date };
      Object.keys(grouped).forEach((user) => {
        const sale = grouped[user].find((s) => s.date.startsWith(date));
        dayData[user] = sale ? Number(sale.amount) : 0;
      });
      return dayData;
    });

    setSalesData(chartData);
    setLoading(false);
  };

  if (loading) return <div><ConcentricLoader /></div>;
  if (salesData.length === 0) return <div>No hay ventas aún</div>;

  // Obtener todos los usuarios para pintar un Area por cada uno
  const users = Object.keys(salesData[0]).filter((k) => k !== "date");

  return (
    <AreaChart width={800} height={300} data={salesData}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="date" />
      <Tooltip />
      {users.map((user, i) => (
        <Area
          key={user}
          dataKey={user}
          stackId="a"
          stroke={`hsl(${i * 60}, 70%, 50%)`}
          fill={`hsl(${i * 60}, 70%, 80%)`}
        />
      ))}
    </AreaChart>
  );
}
