import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { IconX, IconUserPlus } from "@tabler/icons-react";
import DialogAddCustomer from "../components/DialogAddCustomer";
import { formatPersonName } from "@/utils/formatName";

export default function SheetNewLead({ open, onOpenChange, sellerId }) {
  const [loading, setLoading] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [inventoryUnits, setInventoryUnits] = useState([]);
  const [reservationUnitId, setReservationUnitId] = useState("");

  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchProduct, setSearchProduct] = useState("");
  const [searchVariant, setSearchVariant] = useState("");

  const [focusCustomer, setFocusCustomer] = useState(false);
  const [focusProduct, setFocusProduct] = useState(false);
  const [focusVariant, setFocusVariant] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState([]);

  const [dialogCustomerOpen, setDialogCustomerOpen] = useState(false);

  const [form, setForm] = useState({
    appointmentDatetime: "",
    notes: "",
    fulfillmentType: "stock",
  });
  const [reservationVariantId, setReservationVariantId] = useState("");

  // 🔍 Buscar clientes
  useEffect(() => {
    if (!focusCustomer) return;
    const fetchCustomers = async () => {
      const q = searchCustomer.trim();
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, last_name, dni, phone, email")
        .or(
          `name.ilike.%${q}%,last_name.ilike.%${q}%,dni.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
        )
        .limit(20);
      if (!error) setCustomers(data || []);
    };
    fetchCustomers();
  }, [focusCustomer, searchCustomer]);

  // 📦 Buscar productos
  useEffect(() => {
    if (!focusProduct) return;
    const q = searchProduct.trim();
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("active", true)
        .ilike("name", `%${q}%`)
        .limit(30);
      if (!error) setProducts(data || []);
    };
    fetchProducts();
  }, [focusProduct, searchProduct]);

  // 🎨 Buscar variantes según producto seleccionado
  useEffect(() => {
    if (!selectedProduct || !focusVariant) return;
    const fetchVariants = async () => {
      const q = searchVariant.trim();
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, variant_name, color, storage, ram, stock, products(name, inventory_tracking_mode)")
        .eq("product_id", selectedProduct.id)
        .eq("active", true)
        .ilike("variant_name", `%${q}%`)
        .limit(40);
      if (!error) setVariants(data || []);
    };
    fetchVariants();
  }, [selectedProduct, focusVariant, searchVariant]);

  useEffect(() => {
    if (!reservationVariantId) {
      setInventoryUnits([]);
      setReservationUnitId("");
      return;
    }
    setReservationUnitId("");
    const loadInventoryUnits = async () => {
      const { data } = await supabase
        .from("inventory_units")
        .select("id, identifier_value, identifier_normalized, status")
        .eq("variant_id", Number(reservationVariantId))
        .eq("status", "available")
        .order("identifier_value");
      setInventoryUnits(data || []);
    };
    loadInventoryUnits();
  }, [reservationVariantId]);

  // ➕ Agregar variante
  const handleAddVariant = (variant) => {
    if (selectedVariants.some((v) => v.id === variant.id)) {
      toast("Ya está en la lista de productos interesados");
      return;
    }
    setSelectedVariants([...selectedVariants, variant]);
    setReservationVariantId((current) => current || String(variant.id));
    if (Number(variant.stock || 0) <= 0) {
      setForm((current) => ({ ...current, fulfillmentType: "a_pedido" }));
    }
    setSearchVariant("");
  };

  // ❌ Quitar variante
  const handleRemoveVariant = (id) => {
    setSelectedVariants(selectedVariants.filter((v) => v.id !== id));
    if (String(reservationVariantId) === String(id)) setReservationVariantId("");
    if (String(reservationUnitId) && String(reservationVariantId) === String(id)) setReservationUnitId("");
  };

  // 🧾 Enviar lead
  const handleSubmit = async () => {
    if (selectedVariants.length === 0) {
      toast.error("Debes agregar al menos una variante interesada");
      return;
    }

    if (!selectedCustomer) {
      toast.error("Debes seleccionar un cliente");
      return;
    }

    if (!form.appointmentDatetime) {
      toast.error("Debes seleccionar una fecha y hora para la cita");
      return;
    }

    const selectedDate = new Date(form.appointmentDatetime);
    const now = new Date();

    if (selectedDate <= now) {
      toast.error("La fecha y hora deben ser posteriores a la actual");
      return;
    }

    setLoading(true);

    const variantList = selectedVariants.map((v) => ({
      id: v.id,
      product_name: v.products?.name || "Producto",
      variant_name: v.variant_name,
      color: v.color,
      storage: v.storage,
      ram: v.ram,
      stock: v.stock,
      inventory_tracking_mode: v.products?.inventory_tracking_mode || "quantity",
    }));

    const hasStock = selectedVariants.some((variant) => Number(variant.stock || 0) > 0);
    const fulfillmentType = hasStock && form.fulfillmentType === "stock" ? "stock" : "a_pedido";
    if (fulfillmentType === "stock" && !reservationVariantId) {
      toast.error("Seleccioná la variante que se va a reservar");
      setLoading(false);
      return;
    }
    const reservationVariant = selectedVariants.find((variant) => String(variant.id) === String(reservationVariantId));
    const selectedReservationUnitId = reservationVariant?.products?.inventory_tracking_mode === "serial"
      ? reservationUnitId
      : null;
    if (fulfillmentType === "stock" && reservationVariant?.products?.inventory_tracking_mode === "serial" && !selectedReservationUnitId) {
      toast.error("Seleccioná un IMEI o código único disponible para reservar");
      setLoading(false);
      return;
    }
    const productStatus = fulfillmentType === "stock" ? "reservado" : "a_pedido";

    const { data: createdLead, error } = await supabase.from("leads").insert([
      {
        referred_by: sellerId,
        customer_id: selectedCustomer?.id || null,
        interested_variants: variantList, // ✅ jsonb en Supabase
        appointment_datetime: form.appointmentDatetime || null,
        notes: form.notes || null,
        status: "pendiente",
        product_status: productStatus,
        fulfillment_type: fulfillmentType,
        reservation_expires_at: fulfillmentType === "stock" ? selectedDate.toISOString() : null,
        deposit_paid: false,
        deposit_amount: 0,
        deposit_currency: "ARS",
      },
    ]).select("id").single();

    setLoading(false);

    if (error) {
      console.error(error);
      toast.error("Error al crear el pedido");
      return;
    }

    if (fulfillmentType === "stock") {
      const { error: reservationError } = await supabase.rpc("reserve_order_stock", {
        p_lead_id: createdLead.id,
        p_variant_id: Number(reservationVariantId),
        p_inventory_unit_id: selectedReservationUnitId ? Number(selectedReservationUnitId) : null,
        p_quantity: 1,
        p_expires_at: selectedDate.toISOString(),
      });
      if (reservationError) {
        await supabase.from("leads").delete().eq("id", createdLead.id);
        setLoading(false);
        toast.error(reservationError.message || "No se pudo reservar el producto");
        return;
      }
    }

    toast.success("Pedido creado correctamente");
    onOpenChange(false);
    // Reset
    setForm({
      appointmentDatetime: "",
      notes: "",
      fulfillmentType: "stock",
    });
    setReservationVariantId("");
    setReservationUnitId("");
    setSelectedCustomer(null);
    setSelectedProduct(null);
    setSelectedVariants([]);
    setSearchCustomer("");
    setSearchProduct("");
    setSearchVariant("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-auto"
      >
        <SheetHeader>
          <SheetTitle>Nuevo pedido</SheetTitle>
          <SheetDescription>
            Selecciona un cliente, un producto y las variantes de su interés.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 px-4">
          {/* 🧍‍♂️ Cliente */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar cliente..."
                value={
                  selectedCustomer
                    ? formatPersonName(
                        selectedCustomer.name,
                        selectedCustomer.last_name
                      )
                    : searchCustomer
                }
                onFocus={() => setFocusCustomer(true)}
                onBlur={() => setTimeout(() => setFocusCustomer(false), 200)}
                onChange={(e) => {
                  setSelectedCustomer(null);
                  setSearchCustomer(e.target.value);
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDialogCustomerOpen(true)}
                title="Nuevo cliente"
              >
                <IconUserPlus className="h-5 w-5" />
              </Button>
            </div>
            {focusCustomer && (
              <div className="absolute z-[9999] mt-1 w-full rounded-md border bg-background shadow">
                <ScrollArea className="max-h-[250px] overflow-y-auto">
                  {customers.length > 0 ? (
                    customers.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setFocusCustomer(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                      >
                        <div className="font-medium">
                          {formatPersonName(c.name, c.last_name)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          DNI: {c.dni || "N/D"} |{" "}
                          {c.phone || c.email || "Sin contacto"}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Sin coincidencias
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>

          {/* 🛍 Producto */}
          <div className="relative">
            <Input
              placeholder="Buscar producto..."
              value={selectedProduct ? selectedProduct.name : searchProduct}
              onFocus={() => setFocusProduct(true)}
              onBlur={() => setTimeout(() => setFocusProduct(false), 200)}
              onChange={(e) => {
                setSelectedProduct(null);
                setSearchProduct(e.target.value);
              }}
            />

            {focusProduct && (
              <div className="absolute z-[9999] mt-1 w-full rounded-md border bg-background shadow">
                <ScrollArea className="max-h-[250px] overflow-y-auto">
                  {products.length > 0 ? (
                    products.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                        onClick={() => {
                          setSelectedProduct(p);
                          setFocusProduct(false);
                          setSearchProduct("");
                          setVariants([]);
                        }}
                      >
                        {p.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Sin coincidencias
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>

          {/* 🎨 Variantes */}
          <div className="relative">
            <Input
              placeholder={
                selectedProduct
                  ? "Buscar variantes (color, capacidad, etc.)"
                  : "Selecciona un producto primero"
              }
              value={searchVariant}
              onFocus={() => setFocusVariant(true)}
              onBlur={() => setTimeout(() => setFocusVariant(false), 200)}
              onChange={(e) => setSearchVariant(e.target.value)}
              disabled={!selectedProduct}
            />

            {focusVariant && selectedProduct && (
              <div className="absolute z-[9999] mt-1 w-full rounded-md border bg-background shadow">
                <ScrollArea className="max-h-[250px] overflow-y-auto">
                  {variants.length > 0 ? (
                    variants.map((v) => (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() => handleAddVariant(v)}
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                      >
                        <div className="font-medium">
                          {v.products?.name || ""} - {v.variant_name || ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {v.color || ""}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Sin coincidencias
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            {/* 🏷 Variantes seleccionadas */}
            {selectedVariants.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedVariants.map((v) => (
                  <Badge
                    key={v.id}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    {v.products?.name || ""} - {v.variant_name || ""} - {v.color || ""}
                    <button
                      type="button"
                      onClick={() => handleRemoveVariant(v.id)}
                      className="ml-1 p-0.5 hover:bg-red-100 rounded"
                    >
                      <IconX className="h-3 w-3 text-red-600" />
                    </button>
                  </Badge>

                ))}
              </div>
            )}
          </div>

          <div className="border rounded-md p-3 space-y-2">
            <Label className="text-sm">Modalidad del pedido</Label>
            <Select
              value={form.fulfillmentType}
              onValueChange={(value) => setForm((current) => ({ ...current, fulfillmentType: value }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stock" disabled={!selectedVariants.some((variant) => Number(variant.stock || 0) > 0)}>
                  Reservar stock disponible
                </SelectItem>
                <SelectItem value="a_pedido">A pedido / sin stock</SelectItem>
              </SelectContent>
            </Select>
            {form.fulfillmentType === "stock" && selectedVariants.length > 0 && (
              <div className="grid gap-2 pt-2">
                <Label className="text-xs">Variante a reservar</Label>
                <Select value={reservationVariantId} onValueChange={setReservationVariantId}>
                  <SelectTrigger><SelectValue placeholder="Seleccioná una variante" /></SelectTrigger>
                  <SelectContent>
                    {selectedVariants.filter((variant) => Number(variant.stock || 0) > 0).map((variant) => (
                      <SelectItem key={variant.id} value={String(variant.id)}>
                        {variant.variant_name || variant.products?.name || "Variante"} ({variant.stock} disponibles)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVariants.find((variant) => String(variant.id) === String(reservationVariantId))?.products?.inventory_tracking_mode === "serial" && (
                  <div className="grid gap-2 pt-2">
                    <Label className="text-xs">IMEI / código único</Label>
                    <Select value={reservationUnitId} onValueChange={setReservationUnitId}>
                      <SelectTrigger><SelectValue placeholder="Seleccioná la unidad a reservar" /></SelectTrigger>
                      <SelectContent>
                        {inventoryUnits.map((unit) => (
                          <SelectItem key={unit.id} value={String(unit.id)}>
                            {unit.identifier_value || unit.identifier_normalized}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!inventoryUnits.length && <p className="text-xs text-destructive">No hay unidades serializadas disponibles.</p>}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              La seña se registra después desde Pedidos por el cajero con caja abierta.
            </p>
          </div>

          {/* 📅 Fecha y notas */}
          <Input
            type="datetime-local"
            value={form.appointmentDatetime}
            onChange={(e) =>
              setForm((f) => ({ ...f, appointmentDatetime: e.target.value }))
            }
          />
          <Textarea
            placeholder="Notas adicionales (preferencias, detalles del producto, etc.)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <SheetFooter className="mt-6">
          <Button className="w-full" disabled={loading} onClick={handleSubmit}>
            {loading ? "Guardando..." : "Guardar pedido"}
          </Button>
        </SheetFooter>
      </SheetContent>
      {/* 💬 Modal para crear cliente */}
      <DialogAddCustomer
        open={dialogCustomerOpen}
        onClose={() => setDialogCustomerOpen(false)}
        onSuccess={(newCustomer) => {
          setSelectedCustomer(newCustomer);
          setDialogCustomerOpen(false);
          toast.success(
            `Cliente ${formatPersonName(
              newCustomer.name,
              newCustomer.last_name
            )} agregado correctamente`
          );
        }}
      />
    </Sheet>
  );
}
