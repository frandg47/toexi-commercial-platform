import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const formatWarrantyBucket = (bucket) =>
  bucket === "defective" ? "Defectuoso" : "Disponible";

const formatWarrantyVariantForNote = (variant) =>
  [
    variant?.products?.name,
    variant?.variant_name,
    variant?.color ? `(${variant.color})` : null,
  ]
    .filter(Boolean)
    .join(" ") || "-";

const buildWarrantyPdfLines = (warranties = []) =>
  warranties.flatMap((warranty) => {
    const lines = [
      `Detalle: ${warranty.reason || "-"}`,
      `Ingreso del equipo devuelto a: ${formatWarrantyBucket(warranty.returned_stock_bucket)}`,
    ];

    if (Math.abs(Number(warranty.price_difference_usd || 0)) > 0.009) {
      lines.push(
        `${warranty.settlement_type === "customer_refund" ? "Reintegro" : "Diferencia cobrada"}: ${
          warranty.settlement_currency || ""
        } ${Number(warranty.settlement_amount || 0).toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} (${Number(warranty.price_difference_usd || 0).toFixed(2)} USD)`,
      );
    }

    if (warranty.settlement_method?.name) {
      lines.push(
        `Metodo: ${warranty.settlement_method.name}${
          warranty.settlement_installments
            ? ` | ${warranty.settlement_installments} cuotas`
            : ""
        }${
          Number(warranty.settlement_multiplier || 1) > 1
            ? ` | x${Number(warranty.settlement_multiplier).toFixed(2)}`
            : ""
        }`,
      );
    }

    if (warranty.notes) {
      lines.push(`Notas de garantia: ${warranty.notes}`);
    }

    if (Number(warranty.store_credit_usd || 0) > 0.009) {
      lines.push(
        `Credito a favor proxima compra: USD ${Number(
          warranty.store_credit_usd || 0,
        ).toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      );
    }

    return lines;
  });

const buildWarrantyPdfRows = (warranties = []) =>
  warranties.flatMap((warranty) => {
    const replacementItems =
      warranty.replacement_items?.length > 0
        ? warranty.replacement_items
        : [
            {
              variant: warranty.replacement_variant,
              imei: warranty.replacement_imei,
              quantity: warranty.quantity,
            },
          ];

    return replacementItems.map((replacement, index) => [
      index === 0 ? formatWarrantyVariantForNote(warranty.original_variant) : "",
      index === 0 ? warranty.original_imei || "-" : "",
      formatWarrantyVariantForNote(replacement.variant),
      replacement.imei || "-",
      String(replacement.quantity || 1),
      index === 0
        ? warranty.settlement_method?.name
          ? `${warranty.settlement_method.name}${
                warranty.settlement_installments
                  ? ` (${warranty.settlement_installments} cuotas)`
                  : ""
            }`
          : Number(warranty.store_credit_usd || 0) > 0.009
            ? "Credito proxima compra"
            : "-"
        : "",
    ]);
  });

export function generateSalePDF(sale, warrantiesBySale = {}) {
  try {
    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;
    const saleWarranties = warrantiesBySale[sale.sale_id] || [];

    const logoWidth = 22;
    const logoHeight = 22;
    const logoX = pageWidth - logoWidth - margin;
    doc.addImage("/toexi.jpg", "JPEG", logoX - 2, margin - 8, logoWidth, logoHeight);

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    const isCanje = sale.sale_type === "canje";
    doc.text(isCanje ? "COMPROBANTE DE CANJE" : "COMPROBANTE DE VENTA", margin, y);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`N°: VTA-${String(sale.sale_id).padStart(6, "0")}`, margin, y + 6);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("DOCUMENTO NO VALIDO COMO FACTURA", margin, y + 12);

    const fecha = new Date(sale.sale_date).toLocaleDateString("es-AR", {
      timeZone: AR_TIMEZONE,
    });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${fecha}`, margin, y + 18);

    y += 32;

    const clienteNombre = `${sale.customer_name || ""} ${sale.customer_last_name || ""}`.trim().toUpperCase();

    doc.setFontSize(11);
    doc.rect(margin, y, 180, 22);

    doc.setFont("helvetica", "bold");
    doc.text("Cliente:", margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(clienteNombre || "SIN NOMBRE", margin + 40, y + 6);

    doc.setFont("helvetica", "bold");
    doc.text("Telefono:", margin + 4, y + 12);
    doc.setFont("helvetica", "normal");
    doc.text(sale.customer_phone || "-", margin + 40, y + 12);

    y += 28;

    const vendedorNombre = sale.seller_name && sale.seller_name.trim()
      ? `${sale.seller_name}${sale.seller_last_name ? ' ' + sale.seller_last_name : ''}`
      : "Toexi Tech";

    doc.setFontSize(11);
    doc.rect(margin, y, 180, 22);

    doc.setFont("helvetica", "bold");
    doc.text("Vendedor:", margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(vendedorNombre, margin + 40, y + 6);

    doc.setFont("helvetica", "bold");
    doc.text("Telefono:", margin + 4, y + 12);
    doc.setFont("helvetica", "normal");
    doc.text(sale.seller_phone || "-", margin + 40, y + 12);

    y += 30;

    // Sección canje: producto recibido
    if (isCanje && sale.trade_in_data) {
      const td = sale.trade_in_data;
      const canjeLines = 4;
      doc.setFontSize(11);
      doc.setDrawColor(128, 0, 128);
      doc.setLineWidth(0.3);
      doc.rect(margin, y, 180, canjeLines * 6 + 4);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(128, 0, 128);
      doc.text("PRODUCTO RECIBIDO EN CANJE", margin + 4, y + 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`Producto: ${td.product_name || ""} ${td.variant_name || ""}`, margin + 4, y + 12);
      doc.text(`Color: ${td.color || "-"}  |  IMEI: ${td.imei || "-"}`, margin + 4, y + 18);
      doc.text(`Monto: $ ${Number(td.amount_ars || 0).toLocaleString("es-AR")} ${td.currency || "ARS"}`, margin + 4, y + 24);
      doc.text(`Cotización: $ ${Number(td.fx_rate_used || 0).toLocaleString("es-AR")}`, margin + 4, y + 30);

      y += canjeLines * 6 + 8;
    }

    autoTable(doc, {
      startY: y,
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontSize: 10,
        fontStyle: "bold",
        lineWidth: 0.3,
        lineColor: [0, 0, 0],
      },
      bodyStyles: {
        fontSize: 10,
        lineWidth: 0.3,
        lineColor: [0, 0, 0],
      },
      head: [["Producto", "Descripción", "Cant", "Precio Unit. (USD)", "Total Parcial"]],
      body: sale.items?.map((i) => {
        const desc = [i.variant_name, i.color].filter(Boolean).join(" - ") || "Modelo Base";
        const unitPrice = i.is_gift ? 0 : Number(i.usd_price || 0);
        const partial = i.is_gift ? 0 : Number((unitPrice * i.quantity).toFixed(2));
        return [
          i.is_gift ? `${i.product_name} (REGALO)` : i.product_name,
          desc,
          i.quantity,
          i.is_gift ? "USD 0.00" : `USD ${unitPrice.toFixed(2)}`,
          i.is_gift ? "USD 0.00" : `USD ${partial.toFixed(2)}`,
        ];
      }) || [],
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 52 },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "right", cellWidth: 36 },
        4: { halign: "right", cellWidth: 38 },
      },
      theme: "plain",
      margin: { top: 0, right: 0, bottom: 0, left: margin },
      didDrawCell: (data) => {
        const { table, row, column } = data;
        const totalRows = table.body.length;
        const totalCols = table.columns.length;

        if (row.index === 0 && column.index === 0) {
          data.cell.styles.lineWidth = [0, 0.3, 0.3, 0];
        } else if (row.index === 0 && column.index === totalCols - 1) {
          data.cell.styles.lineWidth = [0, 0, 0.3, 0.3];
        } else if (row.index === totalRows - 1 && column.index === 0) {
          data.cell.styles.lineWidth = [0.3, 0.3, 0, 0];
        } else if (row.index === totalRows - 1 && column.index === totalCols - 1) {
          data.cell.styles.lineWidth = [0.3, 0, 0, 0.3];
        } else if (row.index === 0) {
          data.cell.styles.lineWidth = [0, 0.3, 0.3, 0.3];
        } else if (row.index === totalRows - 1) {
          data.cell.styles.lineWidth = [0.3, 0.3, 0, 0.3];
        } else if (column.index === 0) {
          data.cell.styles.lineWidth = [0.3, 0.3, 0.3, 0];
        } else if (column.index === totalCols - 1) {
          data.cell.styles.lineWidth = [0.3, 0, 0.3, 0.3];
        } else {
          data.cell.styles.lineWidth = [0.3, 0.3, 0.3, 0.3];
        }
      }
    });

    y = doc.lastAutoTable.finalY + 10;

    const subtotalUsd = sale.items?.reduce((acc, i) => {
      if (i.is_gift) return acc;
      return acc + Number(i.subtotal_usd || (i.usd_price || 0) * (i.quantity || 0));
    }, 0) || 0;
    const discountAmount = Number(sale.discount_amount || 0);
    const surchargeAmount = Number(sale.surcharge_amount || 0);
    const hasDiscount = discountAmount > 0;
    const hasSurcharge = surchargeAmount > 0;

    const tradeInCredit = Number(sale.trade_in_credit || sale.trade_in_data?.amount_ars || 0);
    const hasTradeIn = isCanje && tradeInCredit > 0;
    const boxHeight = hasTradeIn ? 48 : 40;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, boxHeight);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    doc.text(`Subtotal USD: USD ${subtotalUsd.toFixed(2)}`, margin + 4, y + 6);
    doc.text(`Cotización: $ ${Number(sale.fx_rate_used || 0).toLocaleString("es-AR")}`, margin + 4, y + 13);
    doc.text(`Total ARS: $ ${Number((sale.fx_rate_used || 0) * subtotalUsd).toLocaleString("es-AR")}`, margin + 4, y + 20);

    if (hasTradeIn) {
      doc.setTextColor(0, 128, 0);
      doc.text(`Crédito canje: -$ ${tradeInCredit.toLocaleString("es-AR")}`, margin + 4, y + 27);
      doc.setTextColor(0);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`TOTAL: $ ${Number(sale.total_ars || 0).toLocaleString("es-AR")}`, margin + 110, y + (hasTradeIn ? 27 : 20));

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const adjLabel = hasDiscount
      ? `Descuento: -$${discountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : hasSurcharge
        ? `Recargo: +$${surchargeAmount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "Descuento/Recargo: $0";
    doc.text(adjLabel, margin + 4, y + (hasTradeIn ? 34 : 27));

    y += boxHeight + 8;

    if (sale.status !== "pending") {
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.text("Formas de Pago:", margin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      sale.payments?.forEach((p) => {
        const isUsd = p.amount_usd != null && Number(p.amount_usd) !== 0;
        const displayAmount = isUsd
          ? `USD ${Number(p.amount_usd).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `$ ${Number(p.amount_ars).toLocaleString("es-AR")}`;
        doc.text(
          `• ${p.payment_method_name}${p.installments ? ` (${p.installments} cuotas)` : ""}: ${displayAmount}`,
          margin,
          y
        );
        y += 5;
      });
    }

    const noteLines = doc.splitTextToSize(`Nota: ${sale.notes || "-"}`, contentWidth);
    doc.text(noteLines, margin, y += 8);
    y += noteLines.length * 5;

    if (saleWarranties.length > 0) {
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.text("Detalle de garantia:", margin, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontSize: 9,
          fontStyle: "bold",
          lineWidth: 0.3,
          lineColor: [0, 0, 0],
        },
        bodyStyles: {
          fontSize: 9,
          lineWidth: 0.3,
          lineColor: [0, 0, 0],
        },
        head: [["Equipo original", "IMEI devuelto", "Reemplazo", "IMEI nuevo", "Cant", "Pago diferencia"]],
        body: buildWarrantyPdfRows(saleWarranties),
        columnStyles: {
          0: { cellWidth: 34 },
          1: { cellWidth: 26 },
          2: { cellWidth: 34 },
          3: { cellWidth: 26 },
          4: { halign: "center", cellWidth: 14 },
          5: { cellWidth: 36 },
        },
        theme: "plain",
        margin: { top: 0, right: 0, bottom: 0, left: margin },
      });

      y = doc.lastAutoTable.finalY + 6;
      doc.setFont("helvetica", "normal");
      const warrantyLines = buildWarrantyPdfLines(saleWarranties).flatMap((line) =>
        doc.splitTextToSize(line, contentWidth),
      );
      doc.text(warrantyLines, margin, y);
      y += warrantyLines.length * 5;
    }

    const pageHeight = doc.internal.pageSize.getHeight();
    const footerCenter = pageWidth / 2;

    let fY = pageHeight - 24;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60);
    doc.text("TOEXI TECH", footerCenter, fY, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    doc.text("Teléfono: 381 364 5246", footerCenter, fY + 5, { align: "center" });
    doc.text("Instagram: @toexi.tech", footerCenter, fY + 10, { align: "center" });

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Gracias por su compra", footerCenter, fY + 17, { align: "center" });

    doc.save(`venta_${sale.sale_id}.pdf`);
    toast.success("PDF descargado correctamente");

  } catch (err) {
    console.error("Error generando PDF:", err);
    toast.error("Error al generar PDF");
  }
}
