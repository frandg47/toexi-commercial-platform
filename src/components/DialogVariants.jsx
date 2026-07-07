import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContextProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { IconPlus, IconTrash, IconDeviceFloppy, IconCopy } from "@tabler/icons-react";
// ❌ ELIMINADO: import Swal from "sweetalert2";

// ✅ AGREGADO: Sonner para notificaciones
import { toast } from "sonner";

// ✅ AGREGADO: AlertDialog para confirmaciones (showCancelButton: true)
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function DialogVariants({ open, onClose, productId, onSave }) {
  const { role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState(null);
  const isSerialTracked = product?.inventory_tracking_mode === "serial";

  const generateVariantName = (variant) => {
    const storage = variant.storage_capacity || variant.storage || "";
    const ram = variant.ram || "";
    if (storage && ram) return `${storage} / ${ram}`;
    if (storage) return storage;
    if (ram) return ram;
    return "";
  };

  // Configuración de campos visibles según categoría
  const VARIANT_FIELDS_BY_CATEGORY = {
    Celulares: [
      "processor",
      "ram",
      "ram_type",
      "storage_capacity",
      "storage_type",
      "screen_size",
      "resolution",
      "battery",
      "color",
      "cost_price_usd",
      "usd_price",
      "stock",
      "camera_main",
      "camera_front",
      "operating_system",
      "wholesale_price"
    ],

    Tablets: [
      "processor",
      "ram",
      "storage_capacity",
      "screen_size",
      "resolution",
      "battery",
      "color",
      "cost_price_usd",
      "usd_price",
      "stock",
      "camera_main",
      "camera_front",
      "operating_system",
      "wholesale_price"
    ],

    Notebooks: [
      "processor",
      "graphics_card",
      "ram",
      "ram_type",
      "ram_frequency",
      "storage_capacity",
      "storage_type",
      "screen_size",
      "resolution",
      "battery",
      "weight",
      "operating_system",
      "color",
      "cost_price_usd",
      "usd_price",
      "stock",
      "wholesale_price"
    ],

    Auriculares: ["color", "cost_price_usd", "usd_price", "stock", "potency", "wholesale_price"],

    Accesorios: ["color", "cost_price_usd", "usd_price", "stock", "potency", "wholesale_price"],

    default: ["color", "cost_price_usd", "usd_price", "stock", "wholesale_price"],
  };



  // Determinar qué campos mostrar
  const visibleFields = useMemo(() => {
    if (!product?.categories?.name) return VARIANT_FIELDS_BY_CATEGORY.default;
    const categoryName = product.categories.name;
    const matchedKey = Object.keys(VARIANT_FIELDS_BY_CATEGORY).find(
      (k) => k.toLowerCase() === categoryName.toLowerCase()
    );
    const baseFields = matchedKey
      ? VARIANT_FIELDS_BY_CATEGORY[matchedKey]
      : VARIANT_FIELDS_BY_CATEGORY.default;

    return isOwner
      ? baseFields
      : baseFields.filter((field) => field !== "cost_price_usd");
  }, [isOwner, product]);

  // Cargar producto y variantes
  useEffect(() => {
    const fetchData = async () => {
      if (!productId) return;
      setLoading(true);

      const { data: productData } = await supabase
        .from("products")
        .select("*, brands(name), categories(name)")
        .eq("id", productId)
        .single();

      setProduct(productData || null);

      const { data: variantsData } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("id", { ascending: true });

      setVariants(variantsData || []);
      setLoading(false);
    };

    if (open) fetchData();
  }, [open, productId]);

  const UPPERCASE_FIELDS = [
    "variant_name", "color", "storage", "storage_capacity", "storage_type",
    "ram", "ram_type", "processor", "screen_size", "resolution", "battery",
    "graphics_card", "camera_main", "camera_front", "operating_system",
  ];

  const handleChange = (index, field, value) => {
    setVariants((prev) => {
      const updated = [...prev];
      const finalValue = UPPERCASE_FIELDS.includes(field) && typeof value === "string"
        ? value.toUpperCase()
        : value;
      updated[index][field] = finalValue;

      const autoFields = ["storage", "storage_capacity", "ram"];
      if (autoFields.includes(field) && !updated[index].variant_name_manual) {
        updated[index].variant_name = generateVariantName(updated[index]);
      }

      return updated;
    });
  };

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        product_id: productId,
        variant_name: "",
        variant_name_manual: false,
        storage: "",
        ram: "",
        color: "",
        processor: "",
        screen_size: "",
        resolution: "",
        battery: "",
        graphics_card: "",
        usd_price: "",
        stock: 0,
        image_url: "",
        active: true,
        cost_price_usd: "",
        wholesale_price: 0,
        camera_main: "",
        camera_front: "",
        operating_system: "",
      },
    ]);
  };


  // Se refactoriza para manejar la lógica de eliminación sin el await Swal.fire
  const handleDeleteVariant = useCallback(async (index, variant) => {
    // Si la variante ya tiene ID, es decir, existe en la BD
    if (variant.id) {
      // Se encapsula la eliminación de la base de datos en una promesa para toast.
      const deletePromise = supabase
        .from("product_variants")
        .delete()
        .eq("id", variant.id)
        .then(({ error }) => {
          if (error) {
            throw new Error("No se pudo eliminar la variante.");
          }
        });

      // 🔁 Reemplazo 2: Manejo de éxito/error de eliminación con toast.promise
      await toast.promise(deletePromise, {
        loading: "Eliminando variante...",
        success: "Variante eliminada correctamente",
        error: "No se pudo eliminar la variante",
      });

      if (onSave) onSave();
    }

    // Si la variante no tiene ID (es nueva) o fue eliminada de la BD, la quitamos del estado local
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // La función original removeVariant solo contendrá la confirmación y llamará a handleDeleteVariant
  // En este componente, la confirmación se maneja directamente en el JSX de renderizado (ver más abajo).
  // Mantenemos esta función simplificada para evitar complejidad de estado en el AlertDialog.
  const removeVariant = async (index, variant) => {
    // Nota: La lógica de confirmación (`Swal.fire`) se movió al JSX,
    // por lo que si se llama a esta función, significa que el usuario ya confirmó.
    await handleDeleteVariant(index, variant);
  };

  const duplicateVariant = (index) => {
    const source = variants[index];
    const duplicate = {
      ...source,
      id: undefined,
      color: "",
      usd_price: "",
      wholesale_price: 0,
      cost_price_usd: "",
      stock: 0,
      variant_name_manual: source.variant_name_manual,
    };
    const updated = [...variants];
    updated.splice(index + 1, 0, duplicate);
    setVariants(updated);
  };


  const saveVariants = async () => {
    const invalidVariantIndex = variants.findIndex(
      (variant) =>
        variant.active !== false &&
        (
          variant.cost_price_usd === "" ||
          variant.cost_price_usd === null ||
          Number.isNaN(Number(variant.cost_price_usd))
        )
    );

    if (isOwner && invalidVariantIndex !== -1) {
      toast.error(`La variante ${invalidVariantIndex + 1} debe tener costo en USD`);
      return;
    }

    const cleanForInsert = ({ variant_name_manual, id, ...rest }) => rest;
    const cleanForUpdate = ({ variant_name_manual, ...rest }) => rest;
    const inserts = variants.filter((v) => !v.id).map(cleanForInsert);
    const updates = variants.filter((v) => v.id).map(cleanForUpdate);

    // Se refactoriza la lógica de guardado dentro de una función para usar toast.promise
    const savePromise = async () => {
      const { error: insertError } =
        inserts.length > 0
          ? await supabase.from("product_variants").insert(inserts)
          : { error: null };

      if (insertError) {
        throw new Error("Error al insertar nuevas variantes.");
      }

      const updatePromises = updates.map((v) =>
        supabase.from("product_variants").update(v).eq("id", v.id)
      );

      const updateResults = updates.length > 0 ? await Promise.all(updatePromises) : [];

      const updateError = updateResults.find(r => r.error)?.error;

      if (updateError) {
        throw new Error("Error al actualizar variantes existentes.");
      }
    };

    // 🔁 Reemplazo 3: Manejo de guardado con toast.promise
    try {
      await toast.promise(savePromise(), {
        loading: "Guardando cambios...",
        success: "Variantes guardadas correctamente",
        error: "No se pudieron guardar los cambios",
      });

      onClose();

      if (onSave) onSave();
    } catch (e) {
      // El error ya fue notificado por toast.promise
      console.error("Error al guardar variantes:", e);
    }

    // ❌ ELIMINADO: Lógica de error y éxito de Swal
    /*
    if (insertError || updateError) {
      Swal.fire("Error", "No se pudieron guardar los cambios", "error");
      return;
    }
    Swal.fire("Éxito", "Variantes guardadas correctamente", "success");
    onClose();
    */
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[90vw] max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Gestionar variantes
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="text-muted-foreground">Cargando datos...</p>
            </div>
          </div>
        ) : (
          <>
            {product && (
              <div className="mb-6 p-4 bg-muted/30 rounded-lg border">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold text-lg">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Marca:</span>{" "}
                      {product.brands?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Categoría:</span>{" "}
                      {product.categories?.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Campos mostrados:{" "}
                      {visibleFields.join(", ") || "por defecto"}
                    </p>
                  </div>
                  <div className="flex justify-center items-center">
                    <img
                      src={product.cover_image_url}
                      alt={product.name}
                      className="h-24 w-24 object-contain rounded-md border bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  {variants.length} variante
                  {variants.length !== 1 ? "s" : ""} configurada
                  {variants.length !== 1 ? "s" : ""}
                </h4>
                <Button variant="outline" onClick={addVariant} size="sm">
                  <IconPlus className="h-4 w-4 mr-2" /> Nueva variante
                </Button>
              </div>

              <div className="space-y-3">
                {variants.map((v, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors space-y-4"
                  >
                    {/* Nombre de variante (manual o generado) */}
                    <div className="grid gap-2">
                      <Label htmlFor={`variant-name-${index}`}>
                        Nombre de variante
                      </Label>
                      <Input
                        id={`variant-name-${index}`}
                        placeholder="ej: 256GB / 8GB"
                        value={v.variant_name || ""}
                        onChange={(e) => {
                          handleChange(index, "variant_name", e.target.value);
                          setVariants((prev) => {
                            const updated = [...prev];
                            updated[index].variant_name_manual = true;
                            return updated;
                          });
                        }}
                      />
                    </div>

                    {/* Campos dinámicos */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-3">
                      {visibleFields.includes("storage") && (
                        <div className="grid gap-2">
                          <Label>Almacenamiento</Label>
                          <Input
                            placeholder="256GB"
                            value={v.storage || ""}
                            onChange={(e) =>
                              handleChange(index, "storage", e.target.value)
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("storage_type") && (
                        <div className="grid gap-2">
                          <Label>Tipo de almacenamiento</Label>
                          <Input
                            placeholder="SSD / NVMe / UFS 3.1"
                            value={v.storage_type || ""}
                            onChange={(e) =>
                              handleChange(index, "storage_type", e.target.value)
                            }
                          />
                        </div>
                      )}


                      {visibleFields.includes("ram") && (
                        <div className="grid gap-2">
                          <Label>RAM</Label>
                          <Input
                            placeholder="8GB"
                            value={v.ram || ""}
                            onChange={(e) =>
                              handleChange(index, "ram", e.target.value)
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("ram_type") && (
                        <div className="grid gap-2">
                          <Label>Tipo de RAM</Label>
                          <Input
                            placeholder="DDR4 / LPDDR5"
                            value={v.ram_type || ""}
                            onChange={(e) =>
                              handleChange(index, "ram_type", e.target.value)
                            }
                          />
                        </div>
                      )}


                      {visibleFields.includes("processor") && (
                        <div className="grid gap-2">
                          <Label>Procesador</Label>
                          <Input
                            placeholder="Snapdragon 8 Gen 2 / Intel i7"
                            value={v.processor || ""}
                            onChange={(e) => handleChange(index, "processor", e.target.value)}
                          />
                        </div>
                      )}

                      {visibleFields.includes("screen_size") && (
                        <div className="grid gap-2">
                          <Label>Pantalla</Label>
                          <Input
                            placeholder='6.7" / 15.6"'
                            value={v.screen_size || ""}
                            onChange={(e) => handleChange(index, "screen_size", e.target.value)}
                          />
                        </div>
                      )}

                      {visibleFields.includes("resolution") && (
                        <div className="grid gap-2">
                          <Label>Resolución</Label>
                          <Input
                            placeholder="1080x2400 / Full HD"
                            value={v.resolution || ""}
                            onChange={(e) => handleChange(index, "resolution", e.target.value)}
                          />
                        </div>
                      )}

                      {visibleFields.includes("battery") && (
                        <div className="grid gap-2">
                          <Label>Batería</Label>
                          <Input
                            placeholder="5000 mAh / 60 Wh"
                            value={v.battery || ""}
                            onChange={(e) => handleChange(index, "battery", e.target.value)}
                          />
                        </div>
                      )}

                      {visibleFields.includes("graphics_card") && (
                        <div className="grid gap-2">
                          <Label>Gráfica</Label>
                          <Input
                            placeholder="RTX 3050 / Radeon"
                            value={v.graphics_card || ""}
                            onChange={(e) => handleChange(index, "graphics_card", e.target.value)}
                          />
                        </div>
                      )}

                      {visibleFields.includes("camera_main") && (
                        <div className="grid gap-2">
                          <Label>Cámara principal</Label>
                          <Input
                            placeholder="50MP f/1.8"
                            value={v.camera_main || ""}
                            onChange={(e) =>
                              handleChange(index, "camera_main", e.target.value)
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("camera_front") && (
                        <div className="grid gap-2">
                          <Label>Cámara frontal</Label>
                          <Input
                            placeholder="12MP"
                            value={v.camera_front || ""}
                            onChange={(e) =>
                              handleChange(index, "camera_front", e.target.value)
                            }
                          />
                        </div>
                      )}


                      {visibleFields.includes("operating_system") && (
                        <div className="grid gap-2">
                          <Label>Sistema operativo</Label>
                          <Input
                            placeholder="Windows 11 / Android 14"
                            value={v.operating_system || ""}
                            onChange={(e) =>
                              handleChange(index, "operating_system", e.target.value)
                            }
                          />
                        </div>
                      )}


                      {visibleFields.includes("color") && (
                        <div className="grid gap-2">
                          <Label>Color</Label>
                          <Input
                            placeholder="Negro"
                            value={v.color || ""}
                            onChange={(e) =>
                              handleChange(index, "color", e.target.value)
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("cost_price_usd") && (
                        <div className="grid gap-2">
                          <Label>Costo USD</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={v.cost_price_usd ?? ""}
                            onChange={(e) =>
                              handleChange(
                                index,
                                "cost_price_usd",
                                e.target.value === ""
                                  ? ""
                                  : parseFloat(e.target.value)
                              )
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("usd_price") && (
                        <div className="grid gap-2">
                          <Label>Precio USD</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={v.usd_price || ""}
                            onChange={(e) =>
                              handleChange(
                                index,
                                "usd_price",
                                e.target.value === ""
                                  ? ""
                                  : parseFloat(e.target.value)
                              )
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("wholesale_price") && (
                        <div className="grid gap-2">
                          <Label>Precio Mayorista USD</Label>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            placeholder="0.00"
                            value={v.wholesale_price || ""}
                            onChange={(e) =>
                              handleChange(
                                index,
                                "wholesale_price",
                                e.target.value === ""
                                  ? ""
                                  : parseFloat(e.target.value)
                              )
                            }
                          />
                        </div>
                      )}

                      {visibleFields.includes("stock") && (
                        <div className="grid gap-2">
                          <Label>Stock</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={v.stock || 0}
                            disabled={isSerialTracked}
                            onChange={(e) =>
                              handleChange(
                                index,
                                "stock",
                                e.target.value === ""
                                  ? 0
                                  : parseInt(e.target.value, 10)
                              )
                            }
                          />
                          {isSerialTracked && (
                            <p className="text-xs text-muted-foreground">
                              El stock de productos serializados se gestionara por
                              unidades trazables en inventario.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Estado y acciones */}
                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={v.active}
                          onCheckedChange={(checked) =>
                            handleChange(index, "active", checked)
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {v.active ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => duplicateVariant(index)}
                          title="Duplicar variante"
                          className="hover:bg-primary/10 hover:text-primary"
                        >
                          <IconCopy className="h-4 w-4" />
                        </Button>

                        {/* 🔄 REEMPLAZO 1: SweetAlert a AlertDialog para confirmación */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <IconTrash className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Eliminar variante
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                ¿Deseas eliminar esta variante?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteVariant(index, v)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Sí, eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        {/* FIN REEMPLAZO 1 */}
                      </div>

                    </div>
                  </div>
                ))}

                {variants.length === 0 && (
                  <div className="text-center py-8 border rounded-lg bg-muted/10">
                    <p className="text-muted-foreground">
                      No hay variantes configuradas
                    </p>
                    <Button variant="link" onClick={addVariant} className="mt-2">
                      Agregar la primera variante
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <DialogFooter className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={saveVariants} disabled={variants.length === 0}>
            <IconDeviceFloppy className="h-4 w-4 mr-2" />
            Guardar {variants.length} variante{variants.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
