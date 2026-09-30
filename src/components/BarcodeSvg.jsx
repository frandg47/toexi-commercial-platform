import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { cn } from "@/lib/utils";

/**
 * Renderiza un codigo de barras CODE128 a partir de un texto (SKU).
 * Si el valor no es codificable, no renderiza nada.
 */
export default function BarcodeSvg({
  value,
  height = 40,
  width = 1.4,
  displayValue = false,
  className,
}) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const text = String(value ?? "").trim();
    if (!text) {
      svgRef.current.innerHTML = "";
      return;
    }

    try {
      JsBarcode(svgRef.current, text, {
        format: "CODE128",
        displayValue,
        height,
        width,
        margin: 0,
        background: "transparent",
        lineColor: "currentColor",
        fontSize: 10,
        fontOptions: "bold",
      });
    } catch (error) {
      console.warn("No se pudo generar el codigo de barras:", error);
      svgRef.current.innerHTML = "";
    }
  }, [value, height, width, displayValue]);

  return <svg ref={svgRef} className={cn("block", className)} aria-hidden="true" />;
}
