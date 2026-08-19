import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { IconPlus } from "@tabler/icons-react";
import DialogCatalog from "@/components/DialogCatalog";

export default function DialogProduct({ open, onClose, product, onSave }) {
  const isEditing = !!product;

  const [form, setForm] = useState({
    name: "",
    brand_id: "",
    category_id: "",
    usd_price: "",
    commission_pct: "",
    commission_fixed: "",
    cover_image_url: "",
    inventory_tracking_mode: "quantity",
    allow_backorder: false,
    lead_time_label: "",
    active: true,
  });

  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [catalogModal, setCatalogModal] = useState({
    open: false,
    type: "",
  });

  // Mostrar imagen existente al abrir y limpiar selección previa
  useEffect(() => {
    if (product?.cover_image_url || product?.coverImageUrl) {
      setImagePreview(product.cover_image_url || product.coverImageUrl);
    } else {
      setImagePreview(null);
    }
    setImageFile(null);
  }, [product]);

  // Cargar datos al editar
  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || "",
        brand_id: product.brand_id || "",
        category_id: product.category_id || "",
        usd_price: product.usd_price || product.usdPrice || "",
        commission_pct:
          product.commissionRuleName === "Propia"
            ? product.commission_pct || product.commissionPct || ""
            : "",
        commission_fixed:
          product.commissionRuleName === "Propia"
            ? product.commission_fixed || product.commissionFixed || ""
            : "",
        cover_image_url: product.cover_image_url || product.coverImageUrl || "",
        inventory_tracking_mode:
          product.inventory_tracking_mode ||
          product.inventoryTrackingMode ||
          "quantity",
        allow_backorder:
          product.allow_backorder ?? product.allowBackorder ?? false,
        lead_time_label: product.lead_time_label || product.leadTimeLabel || "",
        active: product.active ?? true,
      });
    } else {
      setForm({
        name: "",
        brand_id: "",
        category_id: "",
        usd_price: "",
        commission_pct: "",
        commission_fixed: "",
        cover_image_url: "",
        inventory_tracking_mode: "quantity",
        allow_backorder: false,
        lead_time_label: "",
        active: true,
      });
    }
  }, [product]);

  // Cargar opciones de marca y categoría
  useEffect(() => {
    const fetchOptions = async () => {
      const [{ data: br }, { data: cat }] = await Promise.all([
        supabase.from("brands").select("id, name"),
        supabase.from("categories").select("id, name"),
      ]);
      setBrands(br || []);
      setCategories(cat || []);
    };
    fetchOptions();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSwitch = (name, checked) => {
    setForm((prev) => ({ ...prev, [name]: checked }));
  };

  const saveProduct = async (payload) => {
    if (isEditing) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", product.id);
      if (error) throw new Error("Error al actualizar el producto.");
    } else {
      const { error } = await supabase.from("products").insert([payload]);
      if (error) throw new Error("Error al crear el producto.");
    }
  };

  const handleCreateCatalogItem = async (name) => {
    const type = catalogModal.type;
    if (!type) return;
    const table = type === "brand" ? "brands" : "categories";

    const { data, error } = await supabase
      .from(table)
      .insert([{ name }])
      .select();

    if (error) {
      toast.error(
        `Error al agregar ${type === "brand" ? "marca" : "categoría"}`
      );
      return;
    }

    const item = data?.[0];
    if (!item) return;

    if (type === "brand") {
      setBrands((prev) => [...prev, item]);
      setForm((prev) => ({ ...prev, brand_id: item.id.toString() }));
    } else {
      setCategories((prev) => [...prev, item]);
      setForm((prev) => ({ ...prev, category_id: item.id.toString() }));
    }

    setCatalogModal({ open: false, type: "" });
  };

  const handleSubmit = async () => {
    if (!form.name || !form.brand_id || !form.category_id) {
      toast.warning(
        "Campos requeridos: Completa al menos nombre, marca y categoría"
      );
      return;
    }

    let imageUrl = form.cover_image_url;

    if (imageFile) {
      imageUrl = await uploadImage(imageFile);
    }

    const payload = {
      name: form.name,
      brand_id: form.brand_id ? parseInt(form.brand_id) : null,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      usd_price: parseFloat(form.usd_price),
      commission_pct: form.commission_pct
        ? parseFloat(form.commission_pct)
        : null,
      commission_fixed: form.commission_fixed
        ? parseFloat(form.commission_fixed)
        : null,
      cover_image_url: imageUrl || null,
      inventory_tracking_mode: form.inventory_tracking_mode || "quantity",
      allow_backorder: form.allow_backorder,
      lead_time_label: form.allow_backorder
        ? form.lead_time_label || null
        : null,
      deposit_amount: form.allow_backorder
        ? form.deposit_amount
          ? parseFloat(form.deposit_amount)
          : null
        : null,
      active: form.active,
    };

    const successMessage = isEditing
      ? "Producto actualizado correctamente"
      : "Producto creado correctamente";

    try {
      await toast.promise(saveProduct(payload), {
        loading: "Guardando producto...",
        success: successMessage,
        error: (err) => err.message || "No se pudo guardar el producto",
      });
      setImagePreview(null);
      onClose();
      onSave();
    } catch (e) {
      console.error("Error al guardar producto:", e);
    }
  };

  const uploadImage = async (file) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `covers/${fileName}`;

    const { error } = await supabase.storage
      .from("products")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("products")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(openState) => {
        if (!openState && isEditing) onSave(); // refresca si es edición
        onClose();
      }}
    >
      <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl font-semibold text-center sm:text-left">
            {isEditing ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Nombre */}
          <div className="flex flex-col gap-2">
            <Label>Nombre</Label>
            <Input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ej: iPhone 15 Pro 256GB"
            />
          </div>

          {/* Marca y categoría */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Marca</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCatalogModal({ open: true, type: "brand" })}
                >
                  <IconPlus className="h-4 w-4" />
                </Button>
              </div>
              <Select
                value={form.brand_id?.toString() || ""}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, brand_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Categoría</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setCatalogModal({ open: true, type: "category" })
                  }
                >
                  <IconPlus className="h-4 w-4" />
                </Button>
              </div>
              <Select
                value={form.category_id?.toString() || ""}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, category_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Precios y comisiones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Comisión fija (USD)</Label>
              <Input
                name="commission_fixed"
                type="number"
                step="0.01"
                disabled={!!form.commission_pct}
                value={form.commission_fixed || ""}
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Comisión (%)</Label>
              <Input
                name="commission_pct"
                type="number"
                step="0.01"
                disabled={!!form.commission_fixed}
                value={form.commission_pct || ""}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Trazabilidad de inventario</Label>
            <Select
              value={form.inventory_tracking_mode || "quantity"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  inventory_tracking_mode: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quantity">Por cantidad</SelectItem>
                <SelectItem value="serial">Por unidad serializada</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.inventory_tracking_mode === "serial"
                ? "Los productos serializados usaran IMEI/SN por unidad. El stock manual de variantes quedara bloqueado."
                : "Los productos no serializados seguiran usando stock agregado por cantidad."}
            </p>
          </div>

          {/* Imagen */}
          <div className="flex flex-col gap-2">
            <Label>Imagen del producto</Label>

            <Input
              type="url"
              placeholder="URL de la imagen (opcional)"
              value={form.cover_image_url || ""}
              disabled={!!imageFile}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, cover_image_url: value }));
                if (value) {
                  setImageFile(null);
                  setImagePreview(value);
                } else if (!imageFile) {
                  setImagePreview(null);
                }
              }}
            />

            <Input
              type="file"
              accept="image/*"
              disabled={!!form.cover_image_url}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                if (file.size > 5 * 1024 * 1024) {
                  toast.error("La imagen no puede superar 5 MB");
                  return;
                }

                setImageFile(file);
                setForm((prev) => ({ ...prev, cover_image_url: "" }));
                setImagePreview(URL.createObjectURL(file));
              }}
            />

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setForm((prev) => ({ ...prev, cover_image_url: "" }));
                  setImageFile(null);
                  setImagePreview(null);
                }}
              >
                Limpiar imagen
              </Button>
            </div>

            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                className="w-32 h-32 object-cover rounded border"
              />
            )}
          </div>

          {/* Switches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="text-sm">Permitir backorder</Label>
              <Switch
                checked={form.allow_backorder}
                onCheckedChange={(checked) =>
                  handleSwitch("allow_backorder", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="text-sm">Activo</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) => handleSwitch("active", checked)}
              />
            </div>
          </div>

          {/* Tiempo de entrega (solo si backorder activo) */}
          {form.allow_backorder && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2 mt-2">
                <Label>Tiempo de entrega</Label>
                <Input
                  name="lead_time_label"
                  placeholder='Ej: "3-4 días"'
                  value={form.lead_time_label || ""}
                  onChange={handleChange}
                />
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <Label>Monto de seña</Label>
                <Input
                  name="deposit_amount"
                  placeholder="Ej: 15.000"
                  value={form.deposit_amount || ""}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          <DialogCatalog
            open={catalogModal.open}
            onClose={() => setCatalogModal({ open: false, type: "" })}
            onConfirm={handleCreateCatalogItem}
            label={`Agregar ${
              catalogModal.type === "brand" ? "Marca" : "Categoría"
            }`}
            initialValue=""
          />
        </div>

        <DialogFooter className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full mr-2 sm:w-auto"
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} className="w-full sm:w-auto">
            {isEditing ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
