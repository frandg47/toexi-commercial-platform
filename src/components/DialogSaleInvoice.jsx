import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { FEATURES } from "@/config/features";

export default function DialogSaleInvoice({ open, onClose, sale, subtotalWithSurcharge }) {
  if (!sale) return null;

  const getVariantQuantity = (variant) =>
    Number(variant?.quantity || variant?.imeis?.length || 0);

  const getVariantIdentifiers = (variant) =>
    Array.isArray(variant?.imeis) ? variant.imeis.filter(Boolean) : [];

  // Helper para detectar método USD
  const getPaymentDisplayCurrency = (methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return "USDT";
    if (upper === "USD") return "USD";
    return "ARS";
  };

  const isUSDMethod = (methodName) =>
    ["USD", "USDT"].includes(methodName?.toUpperCase());

  const getPaymentFxRate = (methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return safeSale.fx_rate_usdt || safeSale.fx_rate_used;
    if (upper === "USD") return safeSale.fx_rate_used;
    return 1;
  };

  // Convertimos datos a seguros
  const safeSale = {
    ...sale,
    variants: Array.isArray(sale?.variants) ? sale.variants : [],
    payments: Array.isArray(sale?.payments) ? sale.payments : [],
  };

  // Detectar si hay pagos en USD
  const hasUSDPayments = safeSale.payments.some(p => isUSDMethod(p.method_name));
  const depositAmountUSD = Number(safeSale.deposit_amount || 0);
  const surchargeAmount = Number(safeSale.surcharge_amount || 0);
  const depositCurrency = safeSale.deposit_currency || "ARS";
  const depositAmount = Number(
    safeSale.deposit_amount_ars ??
      (depositCurrency === "USD"
        ? depositAmountUSD * safeSale.fx_rate_used
        : depositAmountUSD)
  );
  const totalDueARS = Number(
    safeSale.total_due_ars ?? safeSale.total_final_ars ?? 0
  );
  const totalUSD =
    safeSale.fx_rate_used > 0 ? (totalDueARS / safeSale.fx_rate_used).toFixed(2) : 0;

  const resetSale = () => {
    if (typeof safeSale.reset === "function") safeSale.reset();
  };

  // ==============================
  //  CONFIRMAR VENTA
  // ==============================
  const handleConfirmSale = async () => {
    try {
      // Preparamos la estructura EXACTA que recibe la función SQL.
      const payload = {
        p_customer_id: safeSale.customer_id,
        p_seller_id: safeSale.seller_id || null,
        p_lead_id: safeSale.lead_id,
        p_sales_channel_id: safeSale.sales_channel_id || null,
        p_fx_rate: safeSale.fx_rate_used,
        p_notes: safeSale.notes,
        p_status: safeSale.status || "vendido",

        p_discount_type: safeSale.discount_type || null,
        p_discount_value: safeSale.discount_value || 0,
        p_discount_amount: safeSale.discount_amount || 0,

        p_items: safeSale.variants.map(v => ({
          variant_id: v.variant_id ?? v.id,
          quantity: getVariantQuantity(v),
          imeis: v.imeis,
          inventory_unit_ids: v.inventory_unit_ids || [],
          usd_price: v.usd_price,
          is_gift: v.is_free ?? false,
        })),

        p_payments: safeSale.payments.map(p => ({
          payment_method_id: p.payment_method_id, // 🔑 clave
          amount: Number(p.amount),
          installments: p.installments ? Number(p.installments) : null,
          reference: p.reference || null,
          account_id: p.account_id || null,
        })),


        p_total_ars: safeSale.total_final_ars,
        p_total_usd: safeSale.total_usd,
      };

      const { data, error } = await supabase.rpc("create_sale_with_imeis", payload);

      if (error) throw error;

      // Registrar en caja diaria si el módulo está activo (solo para ventas completadas)
      if (FEATURES.CASH_REGISTER && safeSale.seller_id && safeSale.status !== "pending") {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const { data: cashRegister } = await supabase
            .from("cash_registers")
            .select("id")
            .eq("user_id", safeSale.seller_id)
            .eq("register_date", today)
            .eq("status", "open")
            .maybeSingle();

          if (cashRegister && totalDueARS > 0) {
            await supabase.rpc("register_sale_in_cash_register", {
              p_register_id: cashRegister.id,
              p_amount: totalDueARS,
              p_currency: "ARS",
              p_sale_id: data.sale_id,
            });
          }
        } catch (cashErr) {
          console.error("Error registrando en caja:", cashErr);
          // No bloquear la venta por error en caja
        }
      }

      toast.success("Venta registrada con éxito");

      handleDownloadPDF({ id: data.sale_id });
      resetSale();
      onClose();

    } catch (err) {
      console.error("❌ Error al confirmar venta:", err);

      // Error de IMEI duplicado
      if (err?.code === "23505" && err?.details?.includes("imei")) {
        const imei = err.details.match(/\((.*?)\)/)?.[1];

        toast.error(
          `El IMEI ${imei} ya fue utilizado en otra venta`,
          {
            description: "No se puede registrar la venta con un equipo ya vendido",
          }
        );
        return;
      }

      // Error genérico
      toast.error("Error procesando la venta", {
        description: err.message || "Ocurrió un error inesperado",
      });
    }

  };


  // ========================================
  // PDF – GENERACIÓN ESTABLE (VERSIÓN ORIGINAL)
  // ========================================
  // ========================================
  // PDF – GENERACIÓN (CORREGIDO CON VENDEDOR + MISMOS TAMAÑOS)
  // ========================================
  const handleDownloadPDF = (savedSale) => {
    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = margin;

    // Logo
    const logoWidth = 22;
    const logoHeight = 22;
    const logoX = pageWidth - logoWidth - margin;
    doc.addImage("/toexi.jpg", "JPEG", logoX - 2, margin - 8, logoWidth, logoHeight);

    // Encabezado
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROBANTE DE VENTA", margin, y);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`N°: VTA-${String(savedSale.id).padStart(6, "0")}`, margin, y + 6);

    y += 26;

    // =============================
    //  CUADRO CLIENTE / FECHAS
    // =============================
    const fecha = new Date().toLocaleDateString("es-AR");

    doc.setFontSize(11);
    doc.rect(margin, y, 180, 22);

    doc.text("Fecha:", margin + 4, y + 6);
    doc.text(fecha, margin + 40, y + 6);

    doc.text("Cliente:", margin + 4, y + 12);
    doc.text(
      `${safeSale.customer_name} (Tel: ${safeSale.customer_phone || "-"})`,
      margin + 40,
      y + 12
    );

    y += 30;

    // =============================
    //  VENDEDOR (NUEVO - IGUAL QUE SALES LIST)
    // =============================
    const vendedorNombre =
      safeSale.seller_name && safeSale.seller_name.trim()
        ? `${safeSale.seller_name}${safeSale.seller_last_name ? ' ' + safeSale.seller_last_name : ''} (Tel: ${safeSale.seller_phone || "3816783617"})`
        : "Toexi Tech";


    doc.setFontSize(11);
    doc.rect(margin, y, 180, 16);

    doc.text("Vendedor:", margin + 4, y + 6);
    doc.text(vendedorNombre, margin + 40, y + 6);

    y += 24;

    // =============================
    //  TABLA DE ITEMS (COLUMNAS IGUAL QUE SALES LIST)
    // =============================
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
      head: [["Producto", "Variante", "Color", "Cant", "IMEI/s", "Subtotal USD", "Subtotal ARS"]],
      body: safeSale.variants.map((v) => [
        v.is_free ? `${v.product_name} (REGALO)` : v.product_name,
        v.variant_name ? v.variant_name : "Modelo Base",
        v.color || "-",
        getVariantQuantity(v),
        getVariantIdentifiers(v).join("\n"),
        v.is_free ? "USD 0.00" : `USD ${v.usd_price.toFixed(2)}`,
        v.is_free ? "$0" : `$ ${(v.usd_price * getVariantQuantity(v) * safeSale.fx_rate_used).toLocaleString("es-AR")}`,
      ]),

      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 32 },
        2: { cellWidth: 18 },
        3: { cellWidth: 12 },
        4: { cellWidth: 30 },
        5: { halign: "right", cellWidth: 30 },
        6: { halign: "right", cellWidth: 26 },
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
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    // =============================
    //  RESUMEN FINANCIERO (SIN CAMBIOS)
    // =============================
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    // doc.text(`Subtotal USD: USD ${safeSale.total_usd.toFixed(2)}`, margin, y);
    // y += 6;
    doc.text(
      `Subtotal: $ ${subtotalWithSurcharge.toLocaleString("es-AR")}`,
      margin,
      y
    );
    y += 6;

    if (safeSale.discount_amount > 0) {
      doc.text(
        `Descuento: -$ ${safeSale.discount_amount.toLocaleString("es-AR")}`,
        margin,
        y
      );
      y += 6;
      if (depositCurrency === "USD" && depositAmountUSD > 0) {
        doc.text(`Seña USD: USD ${depositAmountUSD.toFixed(2)}`, margin, y);
        y += 6;
      }
    }

    if (surchargeAmount > 0) {
      doc.text(
        `Recargo: $ ${surchargeAmount.toLocaleString("es-AR")}`,
        margin,
        y
      );
      y += 6;
    }

    if (depositAmount > 0) {
      doc.text(
        `Seña aplicada: -$ ${depositAmount.toLocaleString("es-AR")}`,
        margin,
        y
      );
      y += 6;
    }

    y += 6;


    doc.text(`Cotización aplicada: $ ${safeSale.fx_rate_used}`, margin, y);
    y += 6;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 100, 200);
    doc.text(`TOTAL: $ ${totalDueARS.toLocaleString("es-AR")}`, margin, y);


    y += 14;

    // =============================
    // MÉTODOS DE PAGO (CON SOPORTE USD)
    // =============================
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("Formas de Pago:", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    safeSale.payments.forEach((p) => {
      const displayCurrency = getPaymentDisplayCurrency(p.method_name);
      const isUsdLike = displayCurrency !== "ARS";
      const amount = Number(p.amount);
      const displayAmount = isUsdLike
        ? `${displayCurrency} ${amount.toFixed(2)}`
        : `$ ${amount.toLocaleString("es-AR")}`;
      const rate = isUsdLike ? getPaymentFxRate(p.method_name) : null;
      const arsEquivalent = isUsdLike && rate
        ? ` (≈ $ ${(amount * safeSale.fx_rate_used).toLocaleString("es-AR")})`
        : "";
      
      doc.text(
        `• ${p.method_name}${p.installments > 1 ? ` (${p.installments} cuotas)` : ""}: ${displayAmount}${arsEquivalent}`,
        margin,
        y
      );
      y += 5;
    });

    doc.text(`Nota: ${safeSale.notes || "-"}`, margin, y + 8);
    y += 4;

    // =============================
    //  FOOTER LEGAL + DATOS EMPRESA
    // =============================
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

    // Legal
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Gracias por su compra", footerCenter, fY + 17, { align: "center" });

    doc.save(`venta_${savedSale.id}.pdf`);
  };


  // ==============================
  // UI
  // ==============================
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Confirmar Venta</DialogTitle>
          <DialogDescription>
            Revisá los datos antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p><strong>Cliente:</strong> {safeSale.customer_name}</p>
          <p><strong>Tel:</strong> {safeSale.customer_phone || "-"}</p>
          <p><strong>Vendedor:</strong> {safeSale.seller_name && safeSale.seller_name.trim() ? safeSale.seller_name : "Toexi Tech"}</p>
          <p><strong>Canal de venta:</strong> {safeSale.sales_channel_name || "-"}</p>
          <p><strong>Cotización:</strong> ${safeSale.fx_rate_used}</p>

          <div className="border rounded p-2 max-h-40 overflow-y-auto">
            {safeSale.variants.map((v, i) => (
              <div key={i} className="text-xs border-b py-1">
                <div className="font-medium">
                  {v.product_name} {v.variant_name} — {getVariantQuantity(v)}u · USD {v.usd_price}
                </div>

                {getVariantIdentifiers(v).length > 0 && (
                  <div className="text-muted-foreground">
                    IMEIs: {getVariantIdentifiers(v).join(", ")}
                  </div>
                )}

              </div>
            ))}
          </div>

          <div className="border rounded p-2 max-h-32 overflow-y-auto text-xs">
            <strong>Métodos de pago:</strong>
            {safeSale.payments.map((p, i) => {
              const displayCurrency = getPaymentDisplayCurrency(p.method_name);
              const isUsdLike = displayCurrency !== "ARS";
              const amount = Number(p.amount);
              const rate = isUsdLike ? getPaymentFxRate(p.method_name) : null;
              const arsEquivalent = isUsdLike && rate ? (amount * rate).toFixed(2) : amount;
              const isUSD = false;
              
              return (
                <div key={i} className="flex justify-between border-b py-1">
                  <span>
                    {p.method_name}
                    {p.installments > 1 ? ` (${p.installments} cuotas)` : ""}
                  </span>
                  <div className="text-right">
                    <div>
                      {isUsdLike
                        ? `${displayCurrency} ${amount.toFixed(2)}`
                        : `$ ${amount.toLocaleString("es-AR")}`}
                    </div>
                    {isUSD && <div className="text-muted-foreground">≈ $ {Number(arsEquivalent).toLocaleString("es-AR")}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-right space-y-1 mt-2">
            <div className="text-sm text-muted-foreground">
              Subtotal con recargos: ${Number(subtotalWithSurcharge).toLocaleString("es-AR")}
              {hasUSDPayments && <div className="text-xs">≈ USD {(subtotalWithSurcharge / safeSale.fx_rate_used).toFixed(2)}</div>}
            </div>

            {safeSale.discount_amount > 0 && (
              <div className="text-sm text-green-600">
                Descuento: −${safeSale.discount_amount.toLocaleString("es-AR")}
              </div>
            )}

            {surchargeAmount > 0 && (
              <div className="text-sm text-orange-600">
                Recargo: ${surchargeAmount.toLocaleString("es-AR")}
              </div>
            )}

            {depositAmount > 0 && (
              <div className="text-sm text-amber-600">
                Seña aplicada: ${depositAmount.toLocaleString("es-AR")}
              </div>
            )}

            {depositCurrency === "USD" && depositAmountUSD > 0 && (
              <div className="text-xs text-muted-foreground">
                Seña USD: USD {depositAmountUSD.toFixed(2)}
              </div>
            )}

            <div className="font-bold text-lg text-primary">
              Total a pagar ahora: ${totalDueARS.toLocaleString("es-AR")}
              {hasUSDPayments && (
                <div className="text-sm text-blue-600">
                  ≈ USD {Number(totalUSD).toLocaleString("en-US")}
                </div>
              )}
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirmSale}>
            Confirmar & Descargar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
