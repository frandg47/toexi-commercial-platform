import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabaseClient";

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

const COLORS = {
  primary: "#111827",
  muted: "#6b7280",
  green: "#16a34a",
  red: "#dc2626",
  blue: "#2563eb",
  amber: "#d97706",
};

function addSectionTitle(doc, title, y) {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary);
  doc.text(title, 14, y);
  return y + 8;
}

function addKPIRow(doc, items, y) {
  doc.setFontSize(10);
  const colWidth = 180 / items.length;
  items.forEach((item, i) => {
    const x = 14 + i * colWidth;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.muted);
    doc.text(item.label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(item.color || COLORS.primary);
    doc.text(item.value, x, y + 5);
  });
  return y + 14;
}

function checkPageBreak(doc, y, needed) {
  if (y + needed > 270) {
    doc.addPage();
    return 20;
  }
  return y;
}

// ========== FINANZAS ==========
async function buildFinanceSection(doc, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [
    { data: salesData },
    { data: expensesData },
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
      .select("id, amount, currency, category, expense_date")
      .gte("expense_date", yearStart)
      .lte("expense_date", yearEnd)
      .eq("is_active", true),
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

  let totalIncome = 0;
  (salesData || []).forEach((s) => {
    totalIncome += Number(s.total_ars || 0);
  });

  let totalExpenses = 0;
  (expensesData || []).forEach((e) => {
    totalExpenses += e.currency === "ARS" ? Number(e.amount || 0) : 0;
  });

  const net = totalIncome - totalExpenses;

  let y = 20;
  y = addSectionTitle(doc, `FINANZAS — Año ${year}`, y);

  y = addKPIRow(doc, [
    { label: "Ingresos totales", value: formatARS(totalIncome), color: COLORS.green },
    { label: "Gastos totales", value: formatARS(totalExpenses), color: COLORS.red },
    { label: "Resultado neto", value: formatARS(net), color: net >= 0 ? COLORS.blue : COLORS.amber },
  ], y);

  y = checkPageBreak(doc, y, 60);

  const catMap = {};
  (expensesData || []).forEach((exp) => {
    const cat = exp.category || "Sin categoría";
    const amount = exp.currency === "ARS" ? Number(exp.amount || 0) : 0;
    catMap[cat] = (catMap[cat] || 0) + amount;
  });
  const catData = Object.entries(catMap)
    .map(([name, value]) => [name, formatARS(value)])
    .sort((a, b) => {
      const aNum = Number(a[1].replace(/[^0-9]/g, ""));
      const bNum = Number(b[1].replace(/[^0-9]/g, ""));
      return bNum - aNum;
    });

  if (catData.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Gastos por categoría", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Categoría", "Monto"]],
      body: catData,
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  y = checkPageBreak(doc, y, 80);

  const customerMap = {};
  (topCustomersData || []).forEach((sale) => {
    if (!sale.customer) return;
    const key = sale.customer.id;
    if (!customerMap[key]) {
      customerMap[key] = {
        name: `${sale.customer.name || ""} ${sale.customer.last_name || ""}`.trim(),
        phone: sale.customer.phone || "",
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

  if (topList.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Mejores clientes", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["#", "Cliente", "Contacto", "Compras", "Total gastado"]],
      body: topList.map((c, i) => [
        i + 1,
        c.name,
        c.phone || "—",
        c.purchaseCount,
        formatARS(c.totalSpent),
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12 },
        3: { cellWidth: 20, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });
  }

  return doc.lastAutoTable.finalY + 10;
}

// ========== INVENTARIO ==========
async function buildInventorySection(doc, startY) {
  let y = startY;

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

  const totalStock = enriched.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
  const totalValue = enriched.reduce((acc, v) => acc + v.totalCost, 0);
  const lowThreshold = 5;
  const lowStockItems = enriched.filter(
    (v) => (Number(v.stock) || 0) > 0 && (Number(v.stock) || 0) <= lowThreshold
  );
  const outOfStockItems = enriched.filter((v) => (Number(v.stock) || 0) === 0);

  y = checkPageBreak(doc, y, 60);
  y = addSectionTitle(doc, "INVENTARIO", y);

  y = addKPIRow(doc, [
    { label: "Stock total", value: `${totalStock.toLocaleString("es-AR")} u.`, color: COLORS.blue },
    { label: "Valor inventario (costo)", value: formatUSD(totalValue), color: COLORS.blue },
    { label: "Stock bajo", value: `${outOfStockItems.length + lowStockItems.length} productos`, color: COLORS.amber },
  ], y);

  y = checkPageBreak(doc, y, 60);

  const catMap = {};
  enriched.forEach((v) => {
    const cat = v.categoryName;
    if (!catMap[cat]) catMap[cat] = { name: cat, totalStock: 0, totalValue: 0 };
    catMap[cat].totalStock += Number(v.stock) || 0;
    catMap[cat].totalValue += v.totalCost;
  });
  const catData = Object.values(catMap).sort((a, b) => b.totalValue - a.totalValue);

  if (catData.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Stock por categoría", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Categoría", "Unidades", "Valor (costo USD)"]],
      body: catData.map((c) => [c.name, c.totalStock, formatUSD(c.totalValue)]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  y = checkPageBreak(doc, y, 60);

  const lowItems = [...outOfStockItems, ...lowStockItems].slice(0, 20);
  if (lowItems.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Productos con stock bajo", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Variante", "Color", "Stock", "Precio USD"]],
      body: lowItems.map((v) => [
        v.productName,
        v.variant_name || "—",
        v.color || "—",
        v.stock,
        formatUSD(v.usd_price),
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  return y;
}

// ========== ANÁLISIS DE VENTAS ==========
async function buildSalesSection(doc, startY) {
  let y = startY;

  const now = new Date();
  const dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - 30);
  const dateFromStr = dateFrom.toISOString().split("T")[0];
  const dateToStr = now.toISOString().split("T")[0];

  const [{ data: items }, { data: variantsData }] = await Promise.all([
    supabase
      .from("sale_items")
      .select(`
        product_name, variant_id, quantity, usd_price,
        sales!inner(sale_date, status, voided_at)
      `)
      .eq("sales.status", "vendido")
      .is("sales.voided_at", null)
      .gte("sales.sale_date", dateFromStr)
      .lte("sales.sale_date", dateToStr),
    supabase
      .from("product_variants")
      .select(`
        id, variant_name, color, stock, usd_price,
        product:products(name)
      `)
      .eq("active", true),
  ]);

  const variants = (variantsData || []).map((v) => ({
    ...v,
    productName: v.product?.name || "—",
  }));

  const productSales = {};
  (items || []).forEach((item) => {
    const name = item.product_name || "—";
    if (!productSales[name]) productSales[name] = { name, quantity: 0, revenue: 0 };
    productSales[name].quantity += Number(item.quantity) || 0;
    productSales[name].revenue += (Number(item.quantity) || 0) * (Number(item.usd_price) || 0);
  });
  const allProducts = Object.values(productSales);
  const topProducts = [...allProducts].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const bottomProducts = [...allProducts].filter((p) => p.quantity > 0).sort((a, b) => a.quantity - b.quantity).slice(0, 10);

  const totalUnits = allProducts.reduce((acc, p) => acc + p.quantity, 0);
  const totalRevenue = allProducts.reduce((acc, p) => acc + p.revenue, 0);

  const variantIds = [...new Set((items || []).map((i) => i.variant_id).filter(Boolean))];
  const lastSalesByVariant = {};
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

    (allSales || []).forEach((si) => {
      const vid = si.variant_id;
      const date = si.sales?.sale_date;
      if (!date) return;
      if (!lastSalesByVariant[vid] || date > lastSalesByVariant[vid]) {
        lastSalesByVariant[vid] = date;
      }
    });
  }

  const stagnantDays = 30;
  const stagnantVariants = variants
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
    })
    .slice(0, 20);

  y = checkPageBreak(doc, y, 60);
  y = addSectionTitle(doc, `ANÁLISIS DE VENTAS — Últimos 30 días`, y);

  y = addKPIRow(doc, [
    { label: "Unidades vendidas", value: totalUnits.toLocaleString("es-AR"), color: COLORS.blue },
    { label: "Ingresos totales", value: formatUSD(totalRevenue), color: COLORS.green },
  ], y);

  y = checkPageBreak(doc, y, 60);

  if (topProducts.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Productos más vendidos", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["#", "Producto", "Unidades", "Ingresos"]],
      body: topProducts.map((p, i) => [
        i + 1,
        p.name,
        p.quantity,
        formatUSD(p.revenue),
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 12 }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  y = checkPageBreak(doc, y, 60);

  if (bottomProducts.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Productos menos vendidos", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["#", "Producto", "Unidades", "Ingresos"]],
      body: bottomProducts.map((p, i) => [
        i + 1,
        p.name,
        p.quantity,
        formatUSD(p.revenue),
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 12 }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  y = checkPageBreak(doc, y, 60);

  if (stagnantVariants.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.primary);
    doc.text("Variantes con stock sin movimiento (30+ días)", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Variante", "Color", "Stock", "Última venta", "Días sin venta"]],
      body: stagnantVariants.map((v) => [
        v.productName,
        v.variant_name || "—",
        v.color || "—",
        v.stock,
        v.lastSale
          ? new Date(v.lastSale).toLocaleDateString("es-AR")
          : "Nunca",
        v.daysWithoutSale !== null ? v.daysWithoutSale : "Nunca",
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 3: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }

  return doc.lastAutoTable.finalY + 10;
}

// ========== MAIN ==========
export default async function generateReportPDF({ year } = {}) {
  const doc = new jsPDF();
  const currentYear = year || new Date().getFullYear();

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary);
  doc.text("Reporte General", 14, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.muted);
  doc.text(
    `Generado el ${new Date().toLocaleDateString("es-AR")} — Año ${currentYear}`,
    14,
    22
  );

  // Page 1: Finanzas
  doc.setFillColor(243, 244, 246);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 26, 210, 271, "F");

  await buildFinanceSection(doc, currentYear);

  // Page 2: Inventario
  doc.addPage();
  doc.setFillColor(243, 244, 246);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 26, 210, 271, "F");

  await buildInventorySection(doc, 20);

  // Page 3: Análisis de ventas
  doc.addPage();
  doc.setFillColor(243, 244, 246);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 26, 210, 271, "F");

  await buildSalesSection(doc, 20);

  doc.save(`Reporte_${currentYear}.pdf`);
}
