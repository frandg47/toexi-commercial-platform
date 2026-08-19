import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatUSD = (n) =>
  `US$ ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;

const formatUSDT = (n) =>
  `USDT ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;

const formatCurrency = (amount, currency) => {
  if (currency === "USD") return formatUSD(amount);
  if (currency === "USDT") return formatUSDT(amount);
  return formatARS(amount);
};

export function generateCashRegisterPDF({
  register,
  movements,
  balance,
  countedCash,
  differencePerCurrency = [],
}) {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen de Caja Diaria", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const openedAt = register.opened_at
      ? new Date(register.opened_at).toLocaleString("es-AR", { timeZone: AR_TIMEZONE })
      : "-";
    const closedAt = register.closed_at
      ? new Date(register.closed_at).toLocaleString("es-AR", { timeZone: AR_TIMEZONE })
      : new Date().toLocaleString("es-AR", { timeZone: AR_TIMEZONE });

    doc.text(`Apertura: ${openedAt}`, 14, 30);
    doc.text(`Cierre: ${closedAt}`, 14, 36);
    doc.text(`Cajero: ${register.users?.name || ""} ${register.users?.last_name || ""}`.trim(), 14, 42);

    let y = 52;

    // Saldo por moneda
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Saldo por moneda", 14, y);
    y += 7;

    const balanceData = Object.entries(balance || {})
      .filter(([, v]) => Math.abs(v) > 0.009)
      .map(([c, v]) => [c, formatCurrency(v, c), v >= 0 ? "Positivo" : "Negativo"]);

    if (balanceData.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Moneda", "Saldo teórico", "Estado"]],
        body: balanceData,
        theme: "grid",
        headStyles: { fillColor: [51, 51, 51] },
        styles: { fontSize: 9 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Efectivo contado
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Efectivo contado", 14, y);
    y += 7;

    const cashData = Object.entries(countedCash || {})
      .filter(([, v]) => v !== "" && v !== "0")
      .map(([c, v]) => [c, formatCurrency(Number(v), c)]);

    if (cashData.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Moneda", "Monto contado"]],
        body: cashData,
        theme: "grid",
        headStyles: { fillColor: [51, 51, 51] },
        styles: { fontSize: 9 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Diferencia por moneda
    if (differencePerCurrency?.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Diferencia por moneda", 14, y);
      y += 7;

      const differenceData = differencePerCurrency.map((item) => {
        const amount = Number(item.difference || 0);
        return [
          item.currency || "ARS",
          formatCurrency(item.expected, item.currency),
          formatCurrency(item.counted, item.currency),
          Math.abs(amount) < 0.01
            ? "Cuadrado"
            : `${amount > 0 ? "Sobrante" : "Faltante"} ${formatCurrency(Math.abs(amount), item.currency)}`,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["Moneda", "Teórico", "Físico", "Resultado"]],
        body: differenceData,
        theme: "grid",
        headStyles: { fillColor: [51, 51, 51] },
        styles: { fontSize: 9 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Movimientos
    if (movements?.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Movimientos del día", 14, y);
      y += 7;

      const typeLabels = {
        opening: "Apertura",
        sale_income: "Venta",
        income: "Ingreso",
        expense: "Gasto",
        withdrawal: "Retiro",
        transfer_in: "Transf. entrada",
        transfer_out: "Transf. salida",
        closing: "Cierre",
      };

      const moveData = movements.map((m) => {
        const isIncome = ["opening", "sale_income", "income", "transfer_in"].includes(m.type);
        return [
          m.created_at
            ? new Date(m.created_at).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: AR_TIMEZONE,
              })
            : "-",
          typeLabels[m.type] || m.type,
          m.accounts?.name || "Caja",
          m.currency || "ARS",
          m.payment_method_name || "-",
          isIncome ? "+" : "-",
          formatCurrency(m.amount, m.currency),
          [m.reference, m.notes].filter(Boolean).join(" — ") || "-",
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["Hora", "Tipo", "Cuenta", "Moneda", "Forma de pago", "Dir.", "Monto", "Detalle"]],
        body: moveData,
        theme: "grid",
        headStyles: { fillColor: [51, 51, 51] },
        styles: { fontSize: 8 },
        columnStyles: { 6: { halign: "right" } },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Generado ${new Date().toLocaleString("es-AR", { timeZone: AR_TIMEZONE })}`,
      pageWidth / 2,
      footerY,
      { align: "center" }
    );

    doc.save(`caja_${register.id || "cierre"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    console.error("Error generating cash register PDF:", err);
  }
}
