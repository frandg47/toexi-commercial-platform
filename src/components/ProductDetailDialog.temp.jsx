import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  IconBox,
  IconColorSwatch,
  IconDeviceFloppy,
} from "@tabler/icons-react";

const currencyFormatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const formatCurrencyUSD = (v) =>
  v == null || Number.isNaN(Number(v))
    ? "-"
    : currencyFormatterUSD.format(v);

export default function ProductDetailDialog({ open, onClose, product }) {
  if (!product) return null;

  // Variantes reales con datos
  const realVariants = useMemo(
    () =>
      (product.variants || []).filter(
        (v) => v.storage || v.ram || (v.color && v.color.trim() !== "")
      ),
    [product.variants]
  );

  // Agrupamos por combinación de storage/ram
  const grouped = useMemo(() => {
    const map = new Map();
    for (const v of realVariants) {
      // Creamos una clave única basada en storage y ram
      const key = [
        v.storage || "",
        v.ram || ""
      ].filter(Boolean).join(" / ").trim() || "Modelo Base";
      
      if (!map.has(key)) {
        map.set(key, { key, variants: [] });
      }
      map.get(key).variants.push(v);
    }
    return [...map.values()];
  }, [realVariants]);

  const [activeTab, setActiveTab] = useState(grouped[0]?.key || "");

  // Grupo seleccionado
  const selectedGroup = grouped.find((g) => g.key === activeTab);
  const firstVariant = selectedGroup?.variants[0] || realVariants[0];

  // Colores disponibles
  const colors = selectedGroup
    ? selectedGroup.variants
        .map((v) => v.color)
        .filter(Boolean)
    : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {product.name}
          </DialogTitle>
          <DialogDescription>
            {product.brandName} — {product.categoryName}
          </DialogDescription>
        </DialogHeader>

        {/* Sección superior */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="flex justify-center items-center">
            <img
              src={product.coverImageUrl}
              alt={product.name}
              className="w-64 h-64 object-contain rounded-md border shadow-sm"
            />
          </div>

          <div className="flex flex-col justify-between">
            <div className="space-y-2">
              <p>
                <span className="font-semibold">Marca:</span>{" "}
                {product.brandName}
              </p>
              <p>
                <span className="font-semibold">Categoría:</span>{" "}
                {product.categoryName}
              </p>

              {/* Nombre de variante activa */}
              <p>
                <span className="font-semibold">Variante:</span>{" "}
                {activeTab || "—"}
              </p>

              {/* Colores disponibles */}
              {colors.length > 0 && (
                <div className="mt-2">
                  <span className="font-semibold">
                    Colores disponibles:
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {colors.map((color, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="flex items-center gap-1 text-xs"
                      >
                        <IconColorSwatch className="h-3 w-3 text-muted-foreground" />
                        {color}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Precio y stock (de la primer variante del grupo activo) */}
              <p>
                <span className="font-semibold">Precio:</span>{" "}
                {formatCurrencyUSD(
                  firstVariant?.usd_price || product.usdPrice
                )}
              </p>
              <p>
                <span className="font-semibold">Stock:</span>{" "}
                <Badge
                  variant={
                    firstVariant?.stock === 0
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {firstVariant?.stock ?? 0}
                </Badge>
              </p>
            </div>

            {product.allowBackorder && (
              <div className="mt-3 p-2 border-l-4 border-amber-500 bg-amber-50 rounded text-sm text-amber-700">
                🔸 Este producto admite pedidos.{" "}
                {product.leadTimeLabel
                  ? `Plazo: ${product.leadTimeLabel}`
                  : "Sin plazo definido."}
              </div>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Tabs: cada variant_name */}
        {grouped.length > 0 && (
          <div className="w-full">
            <h3 className="mb-3 text-lg font-semibold flex items-center gap-2">
              <IconBox className="w-5 h-5 text-primary" />
              Variantes disponibles
            </h3>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap justify-start gap-2">
                {grouped.map((g) => (
                  <TabsTrigger
                    key={g.key}
                    value={g.key}
                    className={`px-3 py-1 rounded-md border transition ${
                      activeTab === g.key
                        ? "bg-primary text-white border-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    {g.key}
                  </TabsTrigger>
                ))}
              </TabsList>

              {grouped.map((g) => (
                <TabsContent key={g.key} value={g.key} className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {g.variants.map((v) => (
                      <div
                        key={v.id}
                        className={`relative rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all ${
                          v.stock === 0
                            ? "opacity-60 border-destructive/60"
                            : "hover:border-primary/70"
                        }`}
                      >
                        <div className="flex flex-col items-center text-center">
                          {v.color && (
                            <p className="text-sm mb-1 font-medium">
                              {v.color}
                            </p>
                          )}
                          <p className="text-sm">
                            {formatCurrencyUSD(v.usd_price)}
                          </p>
                          <p
                            className={`mt-1 text-xs font-medium ${
                              v.stock === 0
                                ? "text-destructive"
                                : "text-green-600"
                            }`}
                          >
                            Stock: {v.stock}
                          </p>
                        </div>

                        {v.stock === 0 && (
                          <span className="absolute top-2 right-2 text-[10px] bg-destructive text-white px-2 py-0.5 rounded-md uppercase shadow-sm">
                            SIN STOCK
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        <Separator className="my-4" />

        {/* Comisión */}
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <IconDeviceFloppy className="w-4 h-4" />
          <p>Comisión por venta: 20%</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}