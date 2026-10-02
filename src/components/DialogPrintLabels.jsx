import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { IconPrinter } from "@tabler/icons-react";
import { supabase } from "@/lib/supabaseClient";
import BarcodeSvg from "@/components/BarcodeSvg";
import {
  LABEL_SIZES,
  DEFAULT_LABEL_SIZE,
  BARCODE_QUALITY_LABELS,
  estimateBarcodeFit,
  printVariantLabels,
} from "@/utils/printVariantLabels";

// Estados de inventory_units que se pueden filtrar al etiquetar IMEIs.
const UNIT_STATUS_OPTIONS = [
  { value: "available", label: "Disponibles" },
  { value: "reentered", label: "Reingresadas" },
  { value: "returned_available", label: "Devueltas" },
  { value: "all", label: "Todos los estados" },
];

export default function DialogPrintLabels({
  open,
  onClose,
  productName = "",
  variants = [],
  isSerialTracked = false,
}) {
  const printable = useMemo(
    () => variants.filter((v) => String(v.sku || "").trim() !== ""),
    [variants]
  );

  const [labelType, setLabelType] = useState("sku");
  const [selectedIds, setSelectedIds] = useState([]);
  const [sizeId, setSizeId] = useState(DEFAULT_LABEL_SIZE);
  const [copies, setCopies] = useState(1);
  const [showProduct, setShowProduct] = useState(true);
  const [showVariant, setShowVariant] = useState(true);
  const [printing, setPrinting] = useState(false);

  // IMEI state
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitStatus, setUnitStatus] = useState("available");
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);

  const size =
    LABEL_SIZES.find((s) => s.id === sizeId) ||
    LABEL_SIZES.find((s) => s.id === DEFAULT_LABEL_SIZE);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setLabelType("sku");
      setSelectedIds(printable.map((v) => v.id));
      setCopies(1);
      setUnitStatus("available");
      setUnits([]);
      setSelectedUnitIds([]);
    }
  }, [open, printable]);

  // Cargar unidades serializadas cuando se cambia a modo IMEI
  const fetchUnits = useCallback(async () => {
    const variantIds = printable.map((v) => v.id);
    if (variantIds.length === 0) return;

    setUnitsLoading(true);
    try {
      let query = supabase
        .from("inventory_units")
        .select("id, identifier_value, status, variant_id")
        .in("variant_id", variantIds)
        .order("identifier_value");

      if (unitStatus !== "all") {
        query = query.eq("status", unitStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      setUnits(data || []);
      setSelectedUnitIds((data || []).map((u) => u.id));
    } catch (error) {
      console.error("Error cargando unidades:", error);
      setUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  }, [printable, unitStatus]);

  useEffect(() => {
    if (open && isSerialTracked && labelType === "imei") {
      fetchUnits();
    }
  }, [open, isSerialTracked, labelType, fetchUnits]);

  const toggleVariant = (id, checked) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
    );
  };

  const toggleUnit = (id, checked) => {
    setSelectedUnitIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
    );
  };

  const allVariantsSelected =
    printable.length > 0 && selectedIds.length === printable.length;
  const allUnitsSelected =
    units.length > 0 && selectedUnitIds.length === units.length;

  const selectAllVariants = () => setSelectedIds(printable.map((v) => v.id));
  const deselectAllVariants = () => setSelectedIds([]);
  const selectAllUnits = () => setSelectedUnitIds(units.map((u) => u.id));
  const deselectAllUnits = () => setSelectedUnitIds([]);

  // ====== Items para impresión ======
  const buildSkuItems = () =>
    printable
      .filter((v) => selectedIds.includes(v.id))
      .map((v) => ({
        sku: v.sku,
        productName,
        variantName: v.variant_name || "",
        copies: Math.max(1, Number(copies) || 1),
      }));

  const buildImeiItems = () =>
    units
      .filter((u) => selectedUnitIds.includes(u.id))
      .map((u) => ({
        sku: u.identifier_value,
        productName: "",
        variantName: "",
        copies: 1,
      }));

  const buildItems = () =>
    labelType === "imei" ? buildImeiItems() : buildSkuItems();

  const handlePrint = async () => {
    const items = buildItems();
    if (items.length === 0) return;

    setPrinting(true);
    const ok = await printVariantLabels(items, {
      sizeId,
      copies: 1,
      showProduct: labelType === "sku" ? showProduct : false,
      showVariant: labelType === "sku" ? showVariant : false,
      labelType,
    });
    setPrinting(false);
    if (ok) onClose();
  };

  // ====== Preview ======
  const previewSkuVariant = printable.find((v) => selectedIds.includes(v.id));
  const previewUnit = units.find((u) => selectedUnitIds.includes(u.id));

  const previewValue =
    labelType === "imei"
      ? previewUnit?.identifier_value || ""
      : previewSkuVariant?.sku || "";

  // ====== Calidad del código ======
  const barcodeFit = useMemo(() => {
    if (!size) return null;

    let longest = "";
    if (labelType === "imei") {
      const selected = units.filter((u) => selectedUnitIds.includes(u.id));
      if (selected.length === 0) return null;
      longest = selected.reduce(
        (acc, u) =>
          String(u.identifier_value || "").length > acc.length
            ? String(u.identifier_value)
            : acc,
        ""
      );
    } else {
      const selected = printable.filter((v) => selectedIds.includes(v.id));
      if (selected.length === 0) return null;
      longest = selected.reduce(
        (acc, v) =>
          String(v.sku || "").length > acc.length ? String(v.sku) : acc,
        ""
      );
    }

    if (!longest) return null;
    return estimateBarcodeFit(longest, size);
  }, [labelType, printable, selectedIds, units, selectedUnitIds, size]);

  const fitInfo = barcodeFit
    ? BARCODE_QUALITY_LABELS[barcodeFit.quality]
    : null;

  // ====== Conteo ======
  const totalLabels =
    labelType === "imei"
      ? selectedUnitIds.length
      : selectedIds.length * (Math.max(1, Number(copies) || 1));

  const nothingToPrint =
    labelType === "imei"
      ? selectedUnitIds.length === 0
      : selectedIds.length === 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[92vw] max-h-[88svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <IconPrinter className="h-5 w-5" />
            Imprimir etiquetas
          </DialogTitle>
          <DialogDescription>
            Se generara un codigo de barras por variante o por IMEI para
            escanear al vender.
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
            {/* Tipo de etiqueta (solo serializados) */}
            {isSerialTracked && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium shrink-0">
                  Tipo de etiqueta:
                </span>
                <div className="flex gap-1 rounded-lg border p-1">
                  <Button
                    variant={labelType === "sku" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setLabelType("sku")}
                    className="px-4"
                  >
                    SKU
                  </Button>
                  <Button
                    variant={labelType === "imei" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setLabelType("imei")}
                    className="px-4"
                  >
                    IMEI
                  </Button>
                </div>
              </div>
            )}

            {/* Configuracion */}
            <div
              className={`grid gap-3 p-4 rounded-lg border bg-muted/20 ${
                labelType === "imei"
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-3"
              }`}
            >
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

              {labelType === "sku" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="label-copies">
                      Copias por variante
                    </Label>
                    <Input
                      id="label-copies"
                      type="number"
                      min="1"
                      max="999"
                      value={copies}
                      onChange={(e) =>
                        setCopies(
                          Math.max(1, parseInt(e.target.value, 10) || 1)
                        )
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
                </>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="unit-status">Estado de unidades</Label>
                  <Select value={unitStatus} onValueChange={setUnitStatus}>
                    <SelectTrigger id="unit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Previsualizacion + indicador de calidad */}
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-white">
              <span className="text-xs text-muted-foreground self-start">
                Vista previa
              </span>

              {previewValue ? (
                <div
                  className="border border-dashed border-neutral-400 bg-white text-black flex flex-col items-center justify-center gap-[0.4mm] overflow-hidden px-[2mm] py-[1mm]"
                  style={{
                    width: `${size.width}mm`,
                    height: `${size.height}mm`,
                  }}
                >
                  <BarcodeSvg
                    value={previewValue}
                    height={Math.round(size.height * 1.5)}
                    width={1.2}
                    className="w-full max-h-[45%] text-black"
                  />
                  <span
                    className="font-bold leading-tight whitespace-nowrap text-black"
                    style={{
                      fontSize: size.height <= 25 ? "5.5pt" : "6.5pt",
                    }}
                  >
                    {previewValue}
                  </span>

                  {/* Solo se muestran producto/variante en modo SKU */}
                  {labelType === "sku" &&
                    showProduct &&
                    productName && (
                      <span
                        className="font-semibold leading-tight truncate max-w-full text-black"
                        style={{
                          fontSize: size.height <= 25 ? "5.5pt" : "6.5pt",
                        }}
                      >
                        {productName}
                      </span>
                    )}
                  {labelType === "sku" &&
                    showVariant &&
                    previewSkuVariant?.variant_name && (
                      <span
                        className="leading-tight truncate max-w-full text-black"
                        style={{
                          fontSize: size.height <= 25 ? "5.5pt" : "6.5pt",
                        }}
                      >
                        {previewSkuVariant.variant_name}
                      </span>
                    )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6">
                  {unitsLoading
                    ? "Cargando unidades..."
                    : labelType === "imei"
                      ? "Selecciona al menos una unidad"
                      : "Selecciona al menos una variante"}
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

            {/* Listado */}
            <div className="space-y-2">
              {labelType === "sku" ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {selectedIds.length} de {printable.length} seleccionada
                      {printable.length !== 1 ? "s" : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={
                        allVariantsSelected
                          ? deselectAllVariants
                          : selectAllVariants
                      }
                    >
                      {allVariantsSelected
                        ? "Quitar todas"
                        : "Seleccionar todas"}
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
                          <Badge
                            variant="outline"
                            className="font-mono text-xs"
                          >
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
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {unitsLoading
                        ? "Cargando..."
                        : `${selectedUnitIds.length} de ${units.length} unidad${units.length !== 1 ? "es" : ""}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={
                        allUnitsSelected ? deselectAllUnits : selectAllUnits
                      }
                      disabled={unitsLoading || units.length === 0}
                    >
                      {allUnitsSelected ? "Quitar todas" : "Seleccionar todas"}
                    </Button>
                  </div>

                  {unitsLoading ? (
                    <div className="h-[220px] rounded-md border p-2 space-y-2">
                      {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : units.length === 0 ? (
                    <div className="h-[220px] rounded-md border flex flex-col items-center justify-center text-center px-4">
                      <p className="text-sm text-muted-foreground">
                        No hay unidades con ese estado.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cambia el filtro o carga seriales desde el inventario.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[220px] rounded-md border">
                      <div className="p-2 space-y-1">
                        {units.map((u) => (
                          <label
                            key={u.id}
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedUnitIds.includes(u.id)}
                              onCheckedChange={(checked) =>
                                toggleUnit(u.id, checked === true)
                              }
                            />
                            <span className="font-mono text-xs">
                              {u.identifier_value}
                            </span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </div>
          </>
        )}

        <DialogFooter className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handlePrint}
            disabled={nothingToPrint || printing || unitsLoading}
          >
            <IconPrinter className="h-4 w-4 mr-2" />
            {printing
              ? "Preparando..."
              : `Imprimir ${totalLabels} etiqueta${totalLabels !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
