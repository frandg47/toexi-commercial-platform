import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconDownload, IconX } from "@tabler/icons-react";
import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value || 0);
};

const formatCurrencyUSD = (value) => {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value || 0);
};

export default function DialogQuoteInvoice({ open, onClose, quote }) {
    const [isPrinting, setIsPrinting] = useState(false);

    if (!quote) return null;

    const handleDownloadPDF = () => {
        const doc = new jsPDF();
        const margin = 14;
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = margin;

        // =============================
        //  LOGO (PARTE SUPERIOR DERECHA)
        // =============================
        const logoWidth = 22;
        const logoHeight = 22;
        const logoX = pageWidth - logoWidth - margin;
        doc.addImage("/toexi.jpg", "JPEG", logoX - 2, margin - 8, logoWidth, logoHeight);

        // =============================
        //  ENCABEZADO
        // =============================
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("PRESUPUESTO", margin, y);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, margin, y + 6);

        y += 30;

        // =============================
        //  INFORMACIÓN GENERAL CLIENTE
        // =============================
        doc.setFontSize(11);
        doc.rect(margin, y, 180, 28);

        doc.text("Cliente:", margin + 4, y + 6);
        doc.text(quote.customer_name, margin + 40, y + 6);

        if (quote.customer_phone) {
            doc.text("Teléfono:", margin + 4, y + 12);
            doc.text(quote.customer_phone, margin + 40, y + 12);
        }

        if (quote.customer_email) {
            doc.text("Email:", margin + 4, y + 18);
            doc.text(quote.customer_email, margin + 40, y + 18);
        }

        y += 36;

        // =============================
        //  INFORMACIÓN VENDEDOR
        // =============================
        const vendedorNombre = quote.seller_name && quote.seller_name.trim()
            ? `${quote.seller_name}${quote.seller_last_name ? ' ' + quote.seller_last_name : ''}`
            : "Toexi Tech";

        doc.setFontSize(11);
        const vendedorBoxHeight = (quote.seller_phone || quote.seller_email) ? 28 : 16;
        doc.rect(margin, y, 180, vendedorBoxHeight);

        doc.text("Vendedor:", margin + 4, y + 6);
        doc.text(vendedorNombre, margin + 40, y + 6);

        if (quote.seller_phone) {
            doc.text("Teléfono:", margin + 4, y + 12);
            doc.text(quote.seller_phone, margin + 40, y + 12);
        }

        if (quote.seller_email) {
            doc.text("Email:", margin + 4, y + 18);
            doc.text(quote.seller_email, margin + 40, y + 18);
        }

        y += (vendedorBoxHeight + 8);

        // =============================
        //  TABLA DE PRODUCTOS
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
            head: [["Producto", "Variante", "Cant", "USD", "Subtotal USD", "Subtotal ARS"]],
            body: quote.items.map((item) => [
                item.name,
                item.variant ?? "Modelo Base",
                item.quantity,
                formatCurrencyUSD(item.usd_price),
                formatCurrencyUSD(item.subtotal_usd),
                formatCurrency(item.subtotal_ars),
            ]),
            columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 35 },
                2: { halign: "center", cellWidth: 15 },
                3: { halign: "right", cellWidth: 25 },
                4: { halign: "right", cellWidth: 30 },
                5: { halign: "right", cellWidth: 35 },
            },
            theme: "plain",
            margin: { top: 0, right: 0, bottom: 0, left: margin },
            didDrawCell: (data) => {
                const { table, row, column } = data;
                const totalRows = table.body.length;
                const totalCols = table.columns.length;

                // Remover bordes externos
                if (row.index === 0 && column.index === 0) {
                    // Top-left
                    data.cell.styles.lineWidth = [0, 0.3, 0.3, 0];
                } else if (row.index === 0 && column.index === totalCols - 1) {
                    // Top-right
                    data.cell.styles.lineWidth = [0, 0, 0.3, 0.3];
                } else if (row.index === totalRows - 1 && column.index === 0) {
                    // Bottom-left
                    data.cell.styles.lineWidth = [0.3, 0.3, 0, 0];
                } else if (row.index === totalRows - 1 && column.index === totalCols - 1) {
                    // Bottom-right
                    data.cell.styles.lineWidth = [0.3, 0, 0, 0.3];
                } else if (row.index === 0) {
                    // Top
                    data.cell.styles.lineWidth = [0, 0.3, 0.3, 0.3];
                } else if (row.index === totalRows - 1) {
                    // Bottom
                    data.cell.styles.lineWidth = [0.3, 0.3, 0, 0.3];
                } else if (column.index === 0) {
                    // Left
                    data.cell.styles.lineWidth = [0.3, 0.3, 0.3, 0];
                } else if (column.index === totalCols - 1) {
                    // Right
                    data.cell.styles.lineWidth = [0.3, 0, 0.3, 0.3];
                } else {
                    // Interior
                    data.cell.styles.lineWidth = [0.3, 0.3, 0.3, 0.3];
                }
            }
        });

        y = doc.lastAutoTable.finalY + 10;

        // =============================
        //  RESUMEN FINANCIERO
        // =============================
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");

        doc.text(`Cotización USD: USD $${quote.cotizacion}`, margin, y);
        y += 6;

        doc.text(`Subtotal USD: ${formatCurrencyUSD(quote.subtotalUSD)}`, margin, y);
        y += 6;

        doc.text(`Subtotal ARS: ${formatCurrency(quote.subtotalARS)}`, margin, y);
        y += 6;

        if (quote.total_final_ars !== quote.subtotalARS) {
            doc.setTextColor(0, 100, 200);
            doc.text(
                `Recargo por financiación: ${formatCurrency(quote.total_final_ars - quote.subtotalARS)}`,
                margin,
                y
            );
            y += 6;
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 100, 200);
        doc.text(`TOTAL: ${formatCurrency(quote.total_final_ars)}`, margin, y);

        y += 14;

        // =============================
        //  MÉTODOS DE PAGO
        // =============================
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text("Formas de Pago:", margin, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        quote.payments.forEach((payment) => {
            doc.text(
                `• ${payment.method_name}${payment.installments ? ` (${payment.installments} cuotas)` : ""}: ${formatCurrency(payment.amount)}`,
                margin,
                y
            );
            y += 5;
        });

        y += 4;

        // =============================
        //  FOOTER
        // =============================
        doc.setFontSize(9);
        doc.setTextColor(120);
        const pageHeight = doc.internal.pageSize.getHeight();
        const footerY = pageHeight - 14;

        const text1 = "Este presupuesto tiene validez de 3 días desde su emisión.";
        const text2 = "Sujeto a disponibilidad de stock y cambios en la cotización.";

        const text1Width = doc.getTextWidth(text1);
        const text2Width = doc.getTextWidth(text2);

        doc.text(text1, (pageWidth - text1Width) / 2, footerY);
        doc.text(text2, (pageWidth - text2Width) / 2, footerY + 5);

        // =============================
        //  DATOS DE LA EMPRESA
        // =============================
        const empresaY = footerY - 20; // un poco más arriba para que entre todo

        doc.setFontSize(10);
        doc.setTextColor(60);
        doc.setFont("helvetica", "bold");

        const empresaNombre = "TOEXI TECH";
        const empresaNombreWidth = doc.getTextWidth(empresaNombre);
        doc.text(empresaNombre, (pageWidth - empresaNombreWidth) / 2, empresaY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        // Teléfono
        const empresaTel = "Teléfono: 3816 78-3617";
        const empresaTelWidth = doc.getTextWidth(empresaTel);
        doc.text(empresaTel, (pageWidth - empresaTelWidth) / 2, empresaY + 6);

        // Redes
        const empresaIg = "Instagram: @toexi.tech";
        const empresaIgWidth = doc.getTextWidth(empresaIg);
        doc.text(empresaIg, (pageWidth - empresaIgWidth) / 2, empresaY + 11);


        // =============================
        //  DESCARGA
        // =============================
        const today = new Date().toISOString().split('T')[0];
        doc.save(`presupuesto_${today}.pdf`);
    };

    const handleDownload = () => {
        setIsPrinting(true);
        setTimeout(() => {
            handleDownloadPDF();
            setIsPrinting(false);
        }, 300);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle>Presupuesto</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Header */}
                    <div className="border-b pb-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold">PRESUPUESTO</h1>
                                <p className="text-sm text-muted-foreground">Cotización de productos</p>
                            </div>
                            <div className="text-right text-sm">
                                <p><strong>Fecha:</strong> {new Date().toLocaleDateString("es-ES")}</p>
                            </div>
                        </div>
                    </div>

                    {/* Cliente */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="font-semibold">Cliente:</p>
                            <p>{quote.customer_name}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold">Cotización:</p>
                            <p>USD ${quote.cotizacion}</p>
                        </div>
                    </div>

                    {/* Tabla de productos */}
                    <div>
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b-2">
                                    <th className="text-left py-2">Producto</th>
                                    <th className="text-left py-2">Variante</th>
                                    <th className="text-center py-2">Cantidad</th>
                                    <th className="text-right py-2">Precio USD</th>
                                    <th className="text-right py-2">Subtotal USD</th>
                                    <th className="text-right py-2">Subtotal ARS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quote.items.map((item, idx) => (
                                    <tr key={idx} className="border-b">
                                        <td className="py-2">{item.name}</td>
                                        <td className="py-2">{item.variant}</td>
                                        <td className="text-center py-2">{item.quantity}</td>
                                        <td className="text-right py-2">{formatCurrencyUSD(item.usd_price)}</td>
                                        <td className="text-right py-2">{formatCurrencyUSD(item.subtotal_usd)}</td>
                                        <td className="text-right py-2">{formatCurrency(item.subtotal_ars)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Resumen financiero */}
                    <div className="space-y-2 border-t pt-4">
                        <div className="flex justify-between text-sm">
                            <span>Subtotal USD:</span>
                            <span className="font-semibold">{formatCurrencyUSD(quote.subtotalUSD)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>Subtotal ARS:</span>
                            <span className="font-semibold">{formatCurrency(quote.subtotalARS)}</span>
                        </div>

                        {quote.total_final_ars !== quote.subtotalARS && (
                            <div className="flex justify-between text-sm bg-blue-50 p-2 rounded">
                                <span>Recargo por financiación:</span>
                                <span className="font-semibold text-blue-600">
                                    {formatCurrency(quote.total_final_ars - quote.subtotalARS)}
                                </span>
                            </div>
                        )}

                        <div className="flex justify-between font-bold text-base border-t pt-2">
                            <span>TOTAL:</span>
                            <span>{formatCurrency(quote.total_final_ars)}</span>
                        </div>
                    </div>

                    {/* Métodos de pago */}
                    <div className="border-t pt-4">
                        <p className="font-semibold mb-2">Formas de Pago:</p>
                        <div className="space-y-1 text-sm">
                            {quote.payments.map((payment, idx) => (
                                <div key={idx} className="flex justify-between">
                                    <span>
                                        {payment.method_name}
                                        {payment.installments && ` (${payment.installments} cuotas)`}
                                    </span>
                                    <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Notas */}
                    {quote.notes && (
                        <div className="border-t pt-4 text-sm">
                            <p className="font-semibold mb-2">Notas:</p>
                            <p className="text-muted-foreground">{quote.notes}</p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="border-t pt-4 text-xs text-muted-foreground text-center">
                        <p>Este presupuesto tiene validez de 3 días desde su emisión.</p>
                        <p>Sujeto a disponibilidad de stock y cambios en la cotización.</p>
                    </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-2 justify-end border-t pt-4">
                    <Button variant="outline" onClick={onClose}>
                        <IconX className="h-4 w-4" />
                        Cerrar
                    </Button>
                    <Button onClick={handleDownload} disabled={isPrinting}>
                        <IconDownload className="h-4 w-4" />
                        {isPrinting ? "Generando..." : "Descargar PDF"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
