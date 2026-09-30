import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { IconPrinter } from "@tabler/icons-react";
import BarcodeSvg from "@/components/BarcodeSvg";
import {
  LABEL_SIZES,
  DEFAULT_LABEL_SIZE,
  BARCODE_QUALITY_LABELS,
  estimateBarcodeFit,
  printVariantLabels,
} from "@/utils/printVariantLabels";

export default function DialogPrintLabels({
  open,
  onClose,
  productName = "",
  variants = [],
}) {
  const printable = useMemo(
    () => variants.filter((v) => String(v.sku || "").trim() !== ""),
    [variants]
  );

  const [selectedIds, setSelectedIds] = useState([]);
  const [sizeId, setSizeId] = useState(DEFAULT_LABEL_SIZE);
  const [copies, setCopies] = useState(1);
  const [showProduct, setShowProduct] = useState(true);
  const [showVariant, setShowVariant] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(printable.map((v) => v.id));
      setCopies(1);
    }
  }, [open, printable]);

  const size =
    LABEL_SIZES.find((s) => s.id === sizeId) ||
    LABEL_SIZES.find((s) => s.id === DEFAULT_LABEL_SIZE);

  const toggleVariant = (id, checked) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
    );
  };

  const selectAll = () => setSelectedIds(printable.map((v) => v.id));
  const selectNone = () => setSelectedIds([]);

  const buildItems = () =>
    printable
      .filter((v) => selectedIds.includes(v.id))
      .map((v) => ({
        sku: v.sku,
        productName,
        variantName: v.variant_name || "",
        copies: Math.max(1, Number(copies) || 1),
      }));

  const handlePrint = async () => {
    if (selectedIds.length === 0) return;
    setPrinting(true);
    const ok = await printVariantLabels(buildItems(), {
      sizeId,
      copies: 1,
      showProduct,
      showVariant,
    });
    setPrinting(false);
    if (ok) onClose();
  };

  const previewVariant = printable.find((v) => selectedIds.includes(v.id));
  const allSelected =
    printable.length > 0 && selectedIds.length === printable.length;

  // Se evalua con el SKU mas largo de la seleccion: es el peor caso de
  // legibilidad para la pistola lectora en el tamaño de etiqueta elegido.
  const barcodeFit = useMemo(() => {
    const selected = printable.filter((v) => selectedIds.includes(v.id));
    if (selected.length === 0 || !size) return null;

    const longest = selected.reduce(
      (acc, v) => (String(v.sku || "").length > acc.length ? String(v.sku) : acc),
      ""
    );
    if (!longest) return null;

    return estimateBarcodeFit(longest, size);
  }, [printable, selectedIds, size]);

  const fitInfo = barcodeFit ? BARCODE_QUALITY_LABELS[barcodeFit.quality] : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[92vw] max-h-[88svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <IconPrinter className="h-5 w-5" />
            Imprimir etiquetas
          </DialogTitle>
          <DialogDescription>
            Se generara un codigo de barras por variante para pegar en el
            producto y escanearlo al vender.
          </DialogDescription>
        </DialogHeader>

        {printable.length === 0 ? (
          <div className="text-center py-10 border rounded-lg bg-muted/10">
            <p className="text-muted-foreground">
              Ninguna variante tiene SKU asignado.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Guarda las variantes primero para que el sistema genere los
              codigos automaticamente.
            </p>
          </div>
        ) : (
          <>
            {/* Configuracion */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border bg-muted/20">
              <div className="grid gap-2">
                <Label htmlFor="label-size">Tamaño de etiqueta</Label>
                <Select value={sizeId} onValueChange={setSizeId}>
                  <SelectTrigger id="label-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABEL_SIZES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="label-copies">Copias por variante</Label>
                <Input
                  id="label-copies"
                  type="number"
                  min="1"
                  max="999"
                  value={copies}
                  onChange={(e) =>
                    setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
              </div>

              <div className="grid gap-2 content-start">
                <Label>Contenido</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="label-show-product"
                    checked={showProduct}
                    onCheckedChange={setShowProduct}
                  />
                  <Label
                    htmlFor="label-show-product"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Producto
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="label-show-variant"
                    checked={showVariant}
                    onCheckedChange={setShowVariant}
                  />
                  <Label
                    htmlFor="label-show-variant"
                    className="text-xs font-normal cursor-pointer"
                  >
                    Variante
                  </Label>
                </div>
              </div>
            </div>

            {/* Previsualizacion + indicador de calidad */}
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-white">
              <span className="text-xs text-muted-foreground self-start">
                Vista previa
              </span>
              {previewVariant ? (
                <div
                  className="border border-dashed border-neutral-400 bg-white text-black flex flex-col items-center justify-center gap-[0.4mm] overflow-hidden px-[2mm] py-[1mm]"
                  style={{ width: `${size.width}mm`, height: `${size.height}mm` }}
                >
                  <BarcodeSvg
                    value={previewVariant.sku}
                    height={Math.round(size.height * 1.5)}
                    width={1.2}
                    className="w-full max-h-[45%] text-black"
                  />
                  <span
                    className="font-bold leading-tight whitespace-nowrap text-black"
                    style={{ fontSize: size.height <= 25 ? "5.5pt" : "6.5pt" }}
                  >
                    {previewVariant.sku}
                  </span>
                  {showProduct && productName && (
                    <span
                      className="font-semibold leading-tight truncate max-w-full text-black"
                      style={{ fontSize: size.height <= 25 ? "5.5pt" : "6.5pt" }}
                    >
                      {productName}
                    </span>
                  )}
                  {showVariant && previewVariant.variant_name && (
                    <span
                      className="leading-tight truncate max-w-full text-black"
                      style={{ fontSize: size.height <= 25 ? "5.5pt" : "6.5pt" }}
                    >
                      {previewVariant.variant_name}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6">
                  Selecciona al menos una variante
                </p>
              )}

              {/* Indicador de calidad del escaneo */}
              {barcodeFit && fitInfo && (
                <p
                  className={`text-xs self-start ${
                    fitInfo.tone === "error"
                      ? "text-red-600 font-medium"
                      : fitInfo.tone === "warn"
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }`}
                  title={`${barcodeFit.dotsPerModule.toFixed(1)} puntos por modulo (203 dpi)`}
                >
                  {fitInfo.text} · {barcodeFit.chars} caracteres ·{" "}
                  {barcodeFit.moduleMm.toFixed(2)} mm/modulo
                </p>
              )}              
            </div>

            {/* Listado de variantes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedIds.length} de {printable.length} seleccionada
                  {printable.length !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={allSelected ? selectNone : selectAll}
                >
                  {allSelected ? "Quitar todas" : "Seleccionar todas"}
                </Button>
              </div>

              <ScrollArea className="h-[220px] rounded-md border">
                <div className="p-2 space-y-1">
                  {printable.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.includes(v.id)}
                        onCheckedChange={(checked) =>
                          toggleVariant(v.id, checked === true)
                        }
                      />
                      <Badge variant="outline" className="font-mono text-xs">
                        {v.sku}
                      </Badge>
                      <span className="text-sm truncate">
                        {v.variant_name || "Sin nombre"}
                      </span>
                      {v.color && (
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {v.color}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        <DialogFooter className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handlePrint}
            disabled={selectedIds.length === 0 || printing}
          >
            <IconPrinter className="h-4 w-4 mr-2" />
            {printing
              ? "Preparando..."
              : `Imprimir ${selectedIds.length * (Number(copies) || 1)} etiqueta${
                  selectedIds.length * (Number(copies) || 1) !== 1 ? "s" : ""
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
