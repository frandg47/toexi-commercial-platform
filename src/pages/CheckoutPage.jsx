import { useEffect, useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  IconReceipt2,
  IconChevronRight,
  IconChevronLeft,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useSaleStore } from "../store/useSaleStore";

export default function SheetNewSale({ open, onOpenChange, lead }) {
  const navigate = useNavigate();

  // Zustand setters
  const setCustomer = useSaleStore((s) => s.setCustomer);
  const setItems = useSaleStore((s) => s.setItems);
  const setFxRate = useSaleStore((s) => s.setFxRate);
  const setNotes = useSaleStore((s) => s.setNotes);

  // Wizard
  const [step, setStep] = useState(1);

  // Search & data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [focusCustomer, setFocusCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState([]);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchProduct, setSearchProduct] = useState("");
  const [searchVariant, setSearchVariant] = useState("");
  const [focusProduct, setFocusProduct] = useState(false);
  const [focusVariant, setFocusVariant] = useState(false);

  const [notes, setNotesField] = useState("");
  const [exchangeRate, setExchangeRate] = useState(null);

  // Exchange rate
  useEffect(() => {
    const fetchExchangeRate = async () => {
      const { data } = await supabase
        .from("fx_rates")
        .select("rate")
        .eq("is_active", true)
        .eq("source", "blue")
        .maybeSingle();
      if (data) setExchangeRate(Number(data.rate));
    };
    fetchExchangeRate();
  }, []);

  // Search customers
  useEffect(() => {
    if (!focusCustomer) return;
    const q = searchCustomer.trim();
    const fetchCustomers = async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .or(
          `name.ilike.%${q}%,last_name.ilike.%${q}%,dni.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
        )
        .limit(20);
      setCustomers(data || []);
    };
    fetchCustomers();
  }, [searchCustomer, focusCustomer]);

  // Search products
  useEffect(() => {
    if (!focusProduct) return;
    const q = searchProduct.trim();
    const fetchProducts = async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name")
        .ilike("name", `%${q}%`)
        .limit(30);
      setProducts(data || []);
    };
    fetchProducts();
  }, [searchProduct, focusProduct]);

  // Search variants
  useEffect(() => {
    if (!selectedProduct || !focusVariant) return;
    const q = searchVariant.trim();
    const fetchVariants = async () => {
      const { data } = await supabase
        .from("product_variants")
        .select(
          "id, variant_name, usd_price, stock, color, storage, ram, products(name)"
        )
        .eq("product_id", selectedProduct.id)
        .gt("stock", 0)
        .ilike("variant_name", `%${q}%`);
      setVariants(data || []);
    };
    fetchVariants();
  }, [selectedProduct, searchVariant, focusVariant]);

  const handleAddVariant = (v) => {
    if (selectedVariants.some((x) => x.id === v.id)) {
      toast("Ya agregado");
      return;
    }
    setSelectedVariants([...selectedVariants, { ...v, quantity: 1 }]);
  };

  const handleQty = (id, qty, stock) => {
    if (qty < 1) return;
    if (qty > stock) return toast.warning(`Máx ${stock} unidades`);

    setSelectedVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, quantity: qty } : v))
    );
  };

  const goToCheckout = () => {
    if (!selectedCustomer) return toast.error("Selecciona un cliente");
    if (!selectedVariants.length) return toast.error("Agrega productos");
    if (!exchangeRate) return toast.error("Cotización inválida");

    setCustomer(selectedCustomer);
    setItems(selectedVariants);
    setFxRate(exchangeRate);
    setNotes(notes);

    onOpenChange(false);
    navigate("/checkout");
  };

  // Total ARS
  const totalARS = useMemo(() => {
    if (!exchangeRate) return 0;
    return selectedVariants.reduce(
      (acc, v) => acc + v.usd_price * v.quantity * exchangeRate,
      0
    );
  }, [selectedVariants, exchangeRate]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva venta</SheetTitle>
          <SheetDescription>Seleccioná cliente y productos</SheetDescription>
        </SheetHeader>

        {/* Wizard */}
        <div className="flex items-center justify-between my-2 border-b pb-2 text-sm">
          <span className={step === 1 ? "font-semibold text-primary" : ""}>
            1. Cliente
          </span>
          <IconChevronRight className="w-4 h-4" />
          <span className={step === 2 ? "font-semibold text-primary" : ""}>
            2. Productos
          </span>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <Input
              placeholder="Buscar cliente..."
              value={
                selectedCustomer
                  ? `${selectedCustomer.name} ${
                      selectedCustomer.last_name || ""
                    }`
                  : searchCustomer
              }
              onFocus={() => setFocusCustomer(true)}
              onBlur={() => setTimeout(() => setFocusCustomer(false), 150)}
              onChange={(e) => {
                setSelectedCustomer(null);
                setSearchCustomer(e.target.value);
              }}
            />
            {focusCustomer && (
              <div className="absolute bg-white border w-full rounded shadow">
                <ScrollArea className="max-h-60">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setFocusCustomer(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-muted"
                    >
                      {c.name} {c.last_name} — {c.phone}
                    </button>
                  ))}
                </ScrollArea>
              </div>
            )}

            <Button disabled={!selectedCustomer} onClick={() => setStep(2)}>
              Continuar <IconChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <Input
              placeholder="Buscar producto..."
              value={selectedProduct ? selectedProduct.name : searchProduct}
              onFocus={() => setFocusProduct(true)}
              onBlur={() => setTimeout(() => setFocusProduct(false), 150)}
              onChange={(e) => {
                setSelectedProduct(null);
                setSearchProduct(e.target.value);
              }}
            />

            {focusProduct && (
              <div className="absolute bg-white border mt-1 w-full rounded shadow">
                <ScrollArea className="max-h-60">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted"
                      onClick={() => {
                        setSelectedProduct(p);
                        setFocusProduct(false);
                        setSearchProduct("");
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </ScrollArea>
              </div>
            )}

            {selectedProduct && (
              <>
                <Input
                  placeholder="Buscar variante..."
                  onFocus={() => setFocusVariant(true)}
                  onBlur={() => setTimeout(() => setFocusVariant(false), 150)}
                  onChange={(e) => setSearchVariant(e.target.value)}
                />

                {focusVariant && (
                  <div className="absolute bg-white border mt-1 w-full rounded shadow">
                    <ScrollArea className="max-h-60">
                      {variants.map((v) => (
                        <button
                          key={v.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted"
                          onClick={() => handleAddVariant(v)}
                        >
                          {v.products?.name} — {v.variant_name} — USD{" "}
                          {v.usd_price} — Stock {v.stock}
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </>
            )}

            {/* Cart */}
            {selectedVariants.length > 0 && (
              <>
                {selectedVariants.map((v) => (
                  <div
                    key={v.id}
                    className="flex justify-between items-center border rounded p-2"
                  >
                    <div>
                      <p className="font-medium text-sm">{v.variant_name}</p>
                      <p className="text-xs text-muted-foreground">
                        USD {v.usd_price} — stock {v.stock}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-16 text-center"
                        value={v.quantity}
                        onChange={(e) =>
                          handleQty(v.id, parseInt(e.target.value), v.stock)
                        }
                      />
                      <button
                        onClick={() =>
                          setSelectedVariants((prev) =>
                            prev.filter((x) => x.id !== v.id)
                          )
                        }
                      >
                        <IconTrash className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}

                <p className="font-semibold text-right">
                  Total: ARS {totalARS.toLocaleString()}
                </p>

                <Textarea
                  placeholder="Notas (opcional)"
                  value={notes}
                  onChange={(e) => setNotesField(e.target.value)}
                />

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <IconChevronLeft className="w-4 h-4 mr-1" /> Volver
                  </Button>
                  <Button onClick={goToCheckout}>
                    Ir a pago <IconChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
