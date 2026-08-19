import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function generateInvoicePDF({ sale, customer, items, payments, fxRate }) {
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("COMPROBANTE DE VENTA", 14, 14);

  doc.setFontSize(10);
  doc.text(`Cliente: ${customer.name} ${customer.last_name}`, 14, 25);
  doc.text(`Fecha: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(`Cotización: $${fxRate}`, 14, 35);

  autoTable(doc, {
    startY: 45,
    head: [["Producto", "Cant", "USD", "Subtotal ARS"]],
    body: items.map((v) => [
      v.variant_name,
      v.quantity,
      v.usd_price,
      (v.quantity * v.usd_price * fxRate).toLocaleString(),
    ]),
  });

  doc.text(`Total ARS: $${sale.total_ars}`, 14, doc.lastAutoTable.finalY + 10);

  doc.save(`Venta_${sale.id}.pdf`);
}
