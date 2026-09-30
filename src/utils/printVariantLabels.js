import JsBarcode from "jsbarcode";
import { toast } from "sonner";

// Tamaños de etiqueta en milimetros, compatibles con ticketeras
// termicas y rotuladoras. El ancho define el tamaño del papel.
export const LABEL_SIZES = [
  { id: "50x25", label: "50 x 25 mm", width: 50, height: 25 },
  { id: "50x30", label: "50 x 30 mm", width: 50, height: 30 },
  { id: "40x20", label: "40 x 20 mm", width: 40, height: 20 },
  { id: "60x40", label: "60 x 40 mm", width: 60, height: 40 },
  { id: "80x40", label: "80 x 40 mm", width: 80, height: 40 },
];

export const DEFAULT_LABEL_SIZE = "50x30";

// Margen horizontal total que reserva la etiqueta (padding + borde seguro).
const LABEL_SAFE_MARGIN_MM = 4;

/**
 * Estima si el codigo de barras va a ser legible para una pistola lectora.
 *
 * CODE128 usa 11 modulos por caracter, mas 11 de inicio, 11 de checksum
 * y 13 de cierre. Las impresoras termicas suelen ser de 203 dpi, donde
 * 1 punto = 0.125 mm; por debajo de ~2 puntos por modulo el escaneo
 * empieza a fallar.
 */
export const estimateBarcodeFit = (value, size) => {
  const chars = String(value || "").length;
  const modules = chars * 11 + 35;
  const printableMm = Math.max(1, size.width - LABEL_SAFE_MARGIN_MM);
  const moduleMm = printableMm / modules;
  const dotsPerModule = moduleMm / 0.125;

  let quality;
  if (dotsPerModule >= 3) quality = "excellent";
  else if (dotsPerModule >= 2.2) quality = "good";
  else if (dotsPerModule >= 1.7) quality = "fair";
  else quality = "poor";

  return { chars, modules, printableMm, moduleMm, dotsPerModule, quality };
};

export const BARCODE_QUALITY_LABELS = {
  excellent: { text: "Escaneo excelente", tone: "ok" },
  good: { text: "Escaneo bueno", tone: "ok" },
  fair: { text: "Escaneo justo", tone: "warn" },
  poor: { text: "Muy fino: puede fallar el escaneo", tone: "error" },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const truncate = (value, max) => {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
};

// Genera el SVG del codigo de barras y lo devuelve como string
// para poder inyectarlo en el documento de impresion.
const renderBarcodeSvg = (value, { height, barWidth }) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  JsBarcode(svg, value, {
    format: "CODE128",
    displayValue: false,
    height,
    width: barWidth,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });

  svg.setAttribute("class", "barcode");
  return new XMLSerializer().serializeToString(svg);
};

// Arma el HTML de una etiqueta segun el tamaño elegido.
const buildLabelHtml = (item, size, options) => {
  const sku = item.sku || item.barcode || "";
  if (!sku) return "";

  // Escala tipografica proporcional al alto de la etiqueta.
  const compact = size.height <= 25;
  const barcodeHeight = compact ? size.height * 0.42 : size.height * 0.4;
  const barWidth = compact ? 1.1 : 1.3;

  const lines = [];
  if (options.showProduct && item.productName) {
    lines.push(
      `<div class="ln ln-strong">${escapeHtml(
        truncate(item.productName, compact ? 22 : 30)
      )}</div>`
    );
  }
  if (options.showVariant && item.variantName) {
    lines.push(
      `<div class="ln">${escapeHtml(
        truncate(item.variantName, compact ? 24 : 34)
      )}</div>`
    );
  }

  let barcodeSvg = "";
  try {
    barcodeSvg = renderBarcodeSvg(sku, {
      height: Math.round(barcodeHeight * 3.78),
      barWidth,
    });
  } catch {
    barcodeSvg = "";
  }

  return `
    <div class="label" style="width:${size.width}mm;height:${size.height}mm">
      ${barcodeSvg}
      <div class="sku">${escapeHtml(sku)}</div>
      ${lines.join("")}
    </div>`;
};

const buildDocument = (items, size, options) => {
  const labels = items
    .map((item) => {
      const copies = Math.max(1, Number(item.copies || options.copies || 1));
      const html = buildLabelHtml(item, size, options);
      return html.repeat(copies);
    })
    .join("");

  const fontSize = size.height <= 25 ? 5.5 : 6.5;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Etiquetas de variantes</title>
<style>
  @page {
    size: ${size.width}mm ${size.height}mm;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label {
    width: ${size.width}mm;
    height: ${size.height}mm;
    padding: 1mm ${LABEL_SAFE_MARGIN_MM / 2}mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    font-family: Arial, Helvetica, sans-serif;
    text-align: center;
  }
  .label:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .barcode {
    display: block;
    max-width: ${size.width - LABEL_SAFE_MARGIN_MM}mm;
    width: 100%;
    height: auto;
  }
  .sku {
    font-size: ${fontSize + 0.5}pt;
    font-weight: 700;
    letter-spacing: 0.2px;
    line-height: 1.1;
    white-space: nowrap;
  }
  .ln {
    font-size: ${fontSize}pt;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: ${size.width - LABEL_SAFE_MARGIN_MM}mm;
  }
  .ln-strong { font-weight: 700; }
</style>
</head>
<body>${labels}</body>
</html>`;
};

// Imprime usando un iframe oculto: evita bloqueos de popup y no
// altera la vista actual del usuario.
const printHtml = (html) =>
  new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("No se pudo acceder a la ventana de impresion");

        win.onafterprint = cleanup;
        win.focus();
        win.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("No se pudo preparar la impresion"));
    };

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
      cleanup();
      reject(new Error("No se pudo preparar la impresion"));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();
  });

/**
 * Imprime etiquetas con codigo de barras para variantes.
 *
 * @param {Array} items [{ sku, productName, variantName, copies }]
 * @param {Object} options { sizeId, copies, showProduct, showVariant }
 */
export async function printVariantLabels(items, options = {}) {
  const valid = (items || []).filter(
    (item) => (item.sku || item.barcode || "").trim() !== ""
  );

  if (valid.length === 0) {
    toast.error("No hay variantes con SKU para imprimir");
    return false;
  }

  const size =
    LABEL_SIZES.find((s) => s.id === options.sizeId) ||
    LABEL_SIZES.find((s) => s.id === DEFAULT_LABEL_SIZE);

  const settings = {
    copies: Math.max(1, Number(options.copies || 1)),
    showProduct: options.showProduct !== false,
    showVariant: options.showVariant !== false,
  };

  try {
    await printHtml(buildDocument(valid, size, settings));
    toast.success(`Enviadas ${valid.length} etiqueta(s) a imprimir`);
    return true;
  } catch (error) {
    console.error("Error imprimiendo etiquetas:", error);
    toast.error("No se pudo imprimir. Revisa que la impresora este lista.");
    return false;
  }
}
