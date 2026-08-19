import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const formatMoney = (amount, currency = "ARS") => {
  const value = Number(amount || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "ARS" ? `$ ${value}` : `${currency} ${value}`;
};

export function generateOrderDepositPDF(receipt) {
  try {
    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;
    const lead = receipt.lead || {};
    const customerName = `${lead.customers?.name || ""} ${lead.customers?.last_name || ""}`.trim().toUpperCase();
    const sellerName = lead.seller?.user
      ? `${lead.seller.user.name || ""} ${lead.seller.user.last_name || ""}`.trim()
      : "Toexi Tech";
    const variants = lead.interested_variants || [];

    const logoWidth = 22;
    const logoHeight = 22;
    const logoX = pageWidth - logoWidth - margin;
    doc.addImage("/toexi.jpg", "JPEG", logoX - 2, margin - 8, logoWidth, logoHeight);

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROBANTE DE SEÑA", margin, y);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`N°: SEN-${String(receipt.receiptId || lead.id || "").padStart(6, "0")}`, margin, y + 6);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("DOCUMENTO NO VALIDO COMO FACTURA", margin, y + 12);

    const date = new Date().toLocaleDateString("es-AR", { timeZone: AR_TIMEZONE });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${date}`, margin, y + 18);
    y += 32;

    doc.setFontSize(11);
    doc.rect(margin, y, 180, 22);
    doc.setFont("helvetica", "bold");
    doc.text("Cliente:", margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(customerName || "SIN NOMBRE", margin + 40, y + 6);
    doc.setFont("helvetica", "bold");
    doc.text("Telefono:", margin + 4, y + 12);
    doc.setFont("helvetica", "normal");
    doc.text(lead.customers?.phone || "-", margin + 40, y + 12);
    doc.setFont("helvetica", "bold");
    doc.text("Pedido:", margin + 105, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(`#${lead.id || "-"}`, margin + 135, y + 6);
    y += 28;

    doc.rect(margin, y, 180, 22);
    doc.setFont("helvetica", "bold");
    doc.text("Vendedor:", margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(sellerName || "Toexi Tech", margin + 40, y + 6);
    doc.setFont("helvetica", "bold");
    doc.text("Telefono:", margin + 4, y + 12);
    doc.setFont("helvetica", "normal");
    doc.text(lead.seller?.user?.phone || "-", margin + 40, y + 12);
    y += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Equipo reservado", margin, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Producto", "Descripcion", "Cant.", "IMEI / Codigo"]],
      body: variants.map((variant) => [
        variant.product_name || variant.name || "Producto",
        [variant.variant_name, variant.color, variant.storage, variant.ram].filter(Boolean).join(" - ") || "-",
        "1",
        variant.imei || variant.identifier_value || (
          String(variant.id) === String(lead.reserved_variant_id)
            ? receipt.reservedIdentifier || "-"
            : "-"
        ),
      ]),
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontSize: 10,
        fontStyle: "bold",
        lineWidth: 0.3,
        lineColor: [0, 0, 0],
      },
      bodyStyles: { fontSize: 9, lineWidth: 0.3, lineColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 67 },
        2: { halign: "center", cellWidth: 16 },
        3: { cellWidth: 49 },
      },
      theme: "plain",
      margin: { top: 0, right: 0, bottom: 0, left: margin },
    });
    y = doc.lastAutoTable.finalY + 10;

    const boxHeight = 58;
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, boxHeight);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Importe de seña: ${formatMoney(receipt.amount, receipt.currency)}`, margin + 4, y + 8);
    doc.text(`Equivalente en ARS: ${formatMoney(receipt.amountARS, "ARS")}`, margin + 4, y + 15);
    if (receipt.rate && receipt.currency !== "ARS") {
      doc.text(`Cotizacion utilizada: ${formatMoney(receipt.rate, "ARS")}`, margin + 4, y + 22);
    }
    doc.text(`Metodo de pago: ${receipt.methodName || "-"}`, margin + 4, y + 29);
    // doc.text(`Cuenta de acreditacion: ${receipt.accountName || "-"}`, margin + 4, y + 36);
    doc.text(`Referencia: ${receipt.reference || "-"}`, margin + 4, y + 43);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Tiempo maximo de espera: ${receipt.expiresAt ? new Date(receipt.expiresAt).toLocaleString("es-AR") : "Sin fecha"}`,
      margin + 4,
      y + 50,
    );
    y += boxHeight + 8;

    const noteLines = doc.splitTextToSize(
      `Nota: La seña queda asociada al pedido y se aplicara al saldo de la venta final. ${lead.notes || ""}`.trim(),
      contentWidth,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(noteLines, margin, y);

    const footerCenter = pageWidth / 2;
    const footerY = doc.internal.pageSize.getHeight() - 24;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60);
    doc.text("TOEXI TECH", footerCenter, footerY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Telefono: 381 364 5246", footerCenter, footerY + 5, { align: "center" });
    doc.text("Instagram: @toexi.tech", footerCenter, footerY + 10, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Gracias por su compra", footerCenter, footerY + 17, { align: "center" });

    doc.save(`sena_${receipt.receiptId || lead.id || "pedido"}.pdf`);
    toast.success("Comprobante de seña descargado correctamente");
  } catch (error) {
    console.error("Error generando comprobante de seña:", error);
    toast.error("Error al generar comprobante de seña");
  }
}
