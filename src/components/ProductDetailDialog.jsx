import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { IconCoin, IconFileTypePdf, IconInfoCircle } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconBox,
  IconColorSwatch,
  IconCreditCard,
  IconCurrencyDollar,
} from "@tabler/icons-react";

const currencyFormatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
const currencyFormatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatCurrencyARS = (v) =>
  v == null || Number.isNaN(Number(v)) ? "-" : currencyFormatterARS.format(v);
const formatCurrencyUSD = (v) =>
  v == null || Number.isNaN(Number(v)) ? "-" : currencyFormatterUSD.format(v);

export default function ProductDetailDialog({
  open,
  onClose,
  product,
  fxRate = 1000,
  paymentMethods = [],
  paymentInstallments = [],
}) {
  if (!product) return null;

  function cleanName(name) {
    return name?.replace(/\s+/g, " ").trim();
  }

  function normalizeVariantKey(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, " / ")
      .replace(/(\d+)\s*(gb|tb|mb|ghz|mhz|mp|mah|wh)\b/gi, "$1$2")
      .trim();
  }


  // 🔹 Variantes reales
  const realVariants = useMemo(() => {
    return (product.variants || []).filter((v) => {
      if (v?.active === false) return false;

      // incluir si tiene nombre de variante
      if (v.variant_name?.trim()) return true;

      // o si tiene storage/ram/color como antes
      return v.storage || v.ram || (v.color && v.color.trim() !== "");
    });
  }, [product.variants]);


  // 🔹 Agrupar variantes por Storage / RAM
  const grouped = useMemo(() => {
    const map = new Map();

    for (const v of realVariants) {
      const rawName = v.variant_name || "";
      const key = normalizeVariantKey(rawName) || "modelo base";

      if (!map.has(key)) map.set(key, { key, displayName: rawName || "Modelo Base", variants: [] });
      map.get(key).variants.push(v);
    }

    return [...map.values()];
  }, [realVariants]);



  const [activeTab, setActiveTab] = useState(grouped[0]?.key || "");
  useEffect(() => {
    if (!grouped.length) {
      setActiveTab("");
      return;
    }

    if (!grouped.some((group) => group.key === activeTab)) {
      setActiveTab(grouped[0]?.key || "");
    }
  }, [activeTab, grouped]);
  const selectedGroup = grouped.find((g) => g.key === activeTab);
  const firstVariant = selectedGroup?.variants[0] || realVariants[0];

  // 🔹 Colores disponibles
  const colors = selectedGroup
    ? selectedGroup.variants.map((v) => v.color).filter(Boolean)
    : [];

  // 🔹 Relacionar métodos con sus cuotas
  const enrichedMethods = useMemo(() => {
    return paymentMethods
      .filter((m) => m?.is_active !== false)
      .map((m) => ({
        ...m,
        installments: paymentInstallments.filter(
          (i) => i.payment_method_id === m.id
        ),
      }));
  }, [paymentMethods, paymentInstallments]);

  // Campos que queremos mostrar dinámicamente en las variantes
  const VARIANT_DISPLAY_FIELDS = {
    storage: "Almacenamiento",
    storage_capacity: "Capacidad de almacenamiento",
    storage_type: "Tipo de almacenamiento",
    ram: "RAM",
    ram_type: "Tipo de RAM",
    ram_frequency: "Frecuencia de RAM",
    processor: "Procesador",
    graphics_card: "Tarjeta gráfica",
    screen_size: "Pantalla",
    resolution: "Resolución",
    battery: "Batería",
    weight: "Peso",
    operating_system: "Sistema operativo",
    camera_main: "Cámara principal",
    camera_front: "Cámara frontal",
  };

  const technicalSpecs = useMemo(() => {
    if (!firstVariant) return [];

    return Object.entries(VARIANT_DISPLAY_FIELDS)
      .map(([field, label]) => {
        const value = firstVariant[field];
        if (!value) return null;
        return { field, label, value };
      })
      .filter(Boolean);
  }, [firstVariant]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[90vw] max-h-[85svh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-xl">
        {/* 🔹 Encabezado */}
        <DialogHeader className="space-y-2 text-center">
          <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight break-words">
            {product.name}
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            {product.brandName} — {product.categoryName}
          </DialogDescription>
        </DialogHeader>

        {/* 🔹 Botón Exportar PDF */}
        {/* <div className="flex justify-center mt-3 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="w-full sm:w-auto flex items-center gap-2"
          >
            <IconFileTypePdf className="w-4 h-4 text-red-600" />
            <span>Exportar PDF</span>
          </Button>
        </div> */}

        {/* 🔹 Imagen + Datos básicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          {/* Imagen */}
          <div className="flex justify-center items-center bg-muted/20 rounded-lg p-4">
            <img
              src={product.coverImageUrl}
              alt={product.name}
              className="max-w-full h-auto w-64 sm:w-72 object-contain rounded-md"
            />
          </div>

          {/* Datos principales */}
          <div className="flex flex-col justify-between text-sm sm:text-base leading-relaxed">
            <div className="space-y-3">
              <p>
                <span className="font-semibold text-foreground">Marca:</span>{" "}
                {product.brandName}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  Categoría:
                </span>{" "}
                {product.categoryName}
              </p>
              <p>
                <span className="font-semibold text-foreground">Variante:</span>{" "}
                {selectedGroup?.displayName || "—"}
              </p>

              {/* Información técnica del modelo seleccionado */}
              {/* {firstVariant && (
                <div className="mt-3 space-y-1">
                  {Object.entries(VARIANT_DISPLAY_FIELDS).map(([field, label]) => {
                    const value = firstVariant[field];
                    if (!value) return null;

                    return (
                      <p key={field} className="text-xs sm:text-sm">
                        <span className="font-semibold">{label}:</span> {value}
                      </p>
                    );
                  })}
                </div>
              )} */}


              {colors.length > 0 && (
                <div>
                  <span className="font-semibold text-foreground">
                    Colores disponibles:
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {colors.map((color, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="flex items-center gap-1 text-xs sm:text-sm"
                      >
                        <IconColorSwatch className="h-3 w-3 text-muted-foreground" />
                        {color}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Precios y stock */}
              <div className="flex flex-col gap-1">
                <p>
                  <span className="font-semibold">Precio en USD:</span>{" "}
                  {formatCurrencyUSD(
                    firstVariant?.usd_price || product.usdPrice
                  )}
                </p>
                <p>
                  <span className="font-semibold">Precio en ARS:</span>{" "}
                  {formatCurrencyARS(
                    (firstVariant?.usd_price || product.usdPrice) * fxRate
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <span className="font-semibold">Stock:</span>{" "}
                  <Badge
                    variant={
                      firstVariant?.stock === 0 ? "destructive" : "secondary"
                    }
                  >
                    {firstVariant?.stock ?? 0}
                  </Badge>
                </p>
              </div>

              {product.allowBackorder && (
                <div className="space-y-2 mt-3">
                  <div className="flex items-center gap-2 p-3 border-l-4 border-amber-500 bg-amber-50 rounded text-xs sm:text-sm text-amber-700">
                    <IconInfoCircle className="h-4 w-4 text-amber-500" /> Este producto admite pedidos.{" "}
                    {product.leadTimeLabel
                      ? `Plazo estimado: ${product.leadTimeLabel}.`
                      : "Sin plazo definido."}
                  </div>

                  {product.depositAmount && (
                    <div className="flex items-center gap-2 p-3 border-l-4 border-blue-500 bg-blue-50 rounded text-xs sm:text-sm text-blue-700">
                      <IconCoin className="h-4 w-4 text-blue-500" /> Seña para reservar:{" "}
                      {formatCurrencyARS(product.depositAmount)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-5" />

        {/* 🔹 Variantes */}
        {grouped.length > 0 && (
          <div>
            <h3 className="mb-4 text-lg sm:text-xl font-semibold flex items-center gap-2">
              <IconBox className="w-5 h-5 text-primary" />
              Variantes disponibles
            </h3>

            {/* Tabs responsivos */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap h-auto w-full gap-2 p-1.5 bg-muted/40 rounded-xl justify-start items-center">
                {grouped.map((g) => (
                  <TabsTrigger
                    key={g.key}
                    value={g.key}
                    className={`py-2 px-4 rounded-md border transition-all text-xs sm:text-sm  ${activeTab === g.key
                      ? "bg-primary border-primary  shadow-sm"
                      : "hover:bg-muted"
                      }`}
                  >
                    {g.displayName}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Contenido del grupo seleccionado */}
            {selectedGroup && (
              <div className="mt-5 space-y-6">
                {/* 🔹 Grilla de variantes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedGroup.variants.map((v) => (
                    <div
                      key={v.id}
                      className={`relative rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all ${v.stock === 0
                        ? "opacity-60 border-destructive/60"
                        : "hover:border-primary/70"
                        }`}
                    >
                      <div className="flex flex-col items-center text-center p-3 gap-1">
                        {v.color && (
                          <p className="text-sm font-semibold">{v.color}</p>
                        )}

                        <p className="text-sm text-muted-foreground">
                          {formatCurrencyUSD(v.usd_price)}
                        </p>

                        <p
                          className={`text-xs font-medium ${v.stock === 0 ? "text-destructive" : "text-green-600"
                            }`}
                        >
                          Stock: {v.stock}
                        </p>
                      </div>

                      {v.stock === 0 && (
                        <span className="absolute top-2 right-2 text-[10px] bg-destructive px-2 py-0.5 rounded-md uppercase shadow-sm">
                          SIN STOCK
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* 🔹 Métodos de pago */}
                <div className="text-xs sm:text-sm text-muted-foreground space-y-2 mt-2">
                  <h3 className="font-semibold text-lg flex items-center gap-2 text-foreground">
                    <IconCreditCard className="w-5 h-5 text-purple-600" />
                    Métodos de pago
                  </h3>

                  {enrichedMethods
                    .filter(
                      (m) =>
                        !["efectivo", "transferencia", "usd", "usdt"].includes(
                          m.name.toLowerCase()
                        )
                    )
                    .map((m) => {
                      const basePriceUSD =
                        selectedGroup.variants[0]?.usd_price || product.usdPrice;
                      return (
                        <div
                          key={m.id}
                          className="border-b pb-1 mb-2 last:border-0"
                        >
                          <p className="font-semibold text-sm text-foreground">
                            {m.name}
                          </p>
                          {m.installments.length > 0 ? (
                            m.installments.map((i) => {
                              const total =
                                basePriceUSD * fxRate * i.multiplier;
                              const cuota = total / i.installments;
                              return (
                                <div
                                  key={i.id}
                                  className="flex flex-col sm:flex-row sm:justify-between gap-1 text-muted-foreground"
                                >
                                  <span>
                                    {i.installments} cuotas de{" "}
                                    {formatCurrencyARS(cuota)}
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {formatCurrencyARS(total)}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="flex justify-between">
                              <span>1 pago sin recargo</span>
                              <span className="font-medium text-foreground">
                                {formatCurrencyARS(
                                  basePriceUSD * fxRate * m.multiplier
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

        )}
        {/* 🔹 Especificaciones técnicas completas */}
        {firstVariant && (
          <div className="mt-6 p-4 border rounded-lg bg-muted/20">
            <h3 className="text-lg font-semibold mb-3">Características técnicas</h3>

            {technicalSpecs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {technicalSpecs.map((spec) => (
                  <div key={spec.field} className="text-sm">
                    <span className="font-semibold">{spec.label}:</span> {spec.value}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay caracteristicas agregadas.
              </p>
            )}
          </div>
        )}

        <Separator className="my-5" />

        {/* 🔹 Cotización actual */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground">
          <IconCurrencyDollar className="w-4 h-4 text-green-500" />
          <span>Cotización actual:</span>{" "}
          <span className="font-semibold text-foreground">
            {formatCurrencyARS(fxRate)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
