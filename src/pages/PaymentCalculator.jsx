// src/pages/PaymentCalculator.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Input
} from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

import { IconCash, IconCreditCard, IconBuildingBank, IconTrash, IconCirclePlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContextProvider";

import DialogQuoteInvoice from "@/components/DialogQuoteInvoice";

export default function PaymentCalculator() {
    const { profile } = useAuth();

    // --- Cliente ---
    const [customers, setCustomers] = useState([]);
    const [searchCustomer, setSearchCustomer] = useState("");
    const [focusCustomer, setFocusCustomer] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // --- Productos / Variantes ---
    const [products, setProducts] = useState([]);
    const [variants, setVariants] = useState([]);
    const [searchProduct, setSearchProduct] = useState("");
    const [searchVariant, setSearchVariant] = useState("");
    const [focusProduct, setFocusProduct] = useState(false);
    const [focusVariant, setFocusVariant] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedVariants, setSelectedVariants] = useState([]);

    // --- Cotizaciones ---
    const [exchangeRate, setExchangeRate] = useState(null);

    // --- Pagos ---
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [paymentInstallments, setPaymentInstallments] = useState([]);
    const [payments, setPayments] = useState([{ payment_method_id: "", method_name: "", amount: "", installments: "", reference: "" }]);

    // --- Preview modal ---
    const [invoiceData, setInvoiceData] = useState(null);
    const [invoiceOpen, setInvoiceOpen] = useState(false);

    const formatARS = (n) =>
        new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);

    // =========================================================
    // FETCH INITIAL DATA
    // =========================================================
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

    useEffect(() => {
        const fetchPayments = async () => {
            const { data: methods } = await supabase.from("payment_methods").select("id, name, multiplier");
            const { data: installments } = await supabase
                .from("payment_installments")
                .select("id, payment_method_id, installments, multiplier");

            setPaymentMethods(methods || []);
            setPaymentInstallments(installments || []);
        };
        fetchPayments();
    }, []);

    // =========================================================
    // CLIENT SEARCH
    // =========================================================
    useEffect(() => {
        if (!focusCustomer) return;

        const q = searchCustomer.trim();
        const fetchCustomers = async () => {
            const { data } = await supabase
                .from("customers")
                .select("id, name, last_name, phone, dni, email")
                .or(
                    `name.ilike.%${q}%,last_name.ilike.%${q}%,dni.ilike.%${q}%,phone.ilike.%${q}%`
                )
                .limit(20);
            setCustomers(data || []);
        };
        fetchCustomers();
    }, [focusCustomer, searchCustomer]);

    // =========================================================
    // PRODUCT SEARCH
    // =========================================================
    useEffect(() => {
        if (!focusProduct) return;
        const q = searchProduct.trim();
        const fetchProducts = async () => {
            const { data } = await supabase.from("products").select("id, name").ilike("name", `%${q}%`);
            setProducts(data || []);
        };
        fetchProducts();
    }, [focusProduct, searchProduct]);

    useEffect(() => {
        if (!selectedProduct || !focusVariant) return;

        const fetchVariants = async () => {
            const { data } = await supabase
                .from("product_variants")
                .select("id, product_id, variant_name, usd_price, stock, color, products(name)")
                .eq("product_id", selectedProduct.id)
                .limit(30);

            setVariants(data || []);
        };
        fetchVariants();
    }, [selectedProduct, searchVariant, focusVariant]);

    const handleAddVariant = (v) => {
        if (selectedVariants.some((x) => x.id === v.id)) {
            toast.warning("Ya está agregado");
            return;
        }

        setSelectedVariants((prev) => [...prev, { ...v, quantity: 1 }]);
        setSearchVariant("");
    };

    // =========================================================
    // TOTALS
    // =========================================================
    const subtotalUSD = useMemo(() => {
        return selectedVariants.reduce((acc, v) => acc + v.usd_price * v.quantity, 0);
    }, [selectedVariants]);

    const baseTotalARS = useMemo(() => {
        if (!exchangeRate) return 0;
        return subtotalUSD * exchangeRate;
    }, [subtotalUSD, exchangeRate]);

    // Pagos sin interés (efectivo/transferencia)
    const paidNoInterest = useMemo(() => {
        return payments
            .filter((p) => {
                const inst = paymentInstallments.find(
                    (i) => i.payment_method_id === Number(p.payment_method_id)
                );
                return !inst || inst.installments === 0 || inst.multiplier === 1;
            })
            .reduce((acc, p) => acc + Number(p.amount || 0), 0);
    }, [payments, paymentInstallments]);

    // Saldo después de pagos sin interés
    const saldo = useMemo(() => {
        return Math.max(baseTotalARS - paidNoInterest, 0);
    }, [baseTotalARS, paidNoInterest]);

    // Buscar método con interés (si existe)
    const interestMethod = useMemo(() => {
        return payments.find((p) => {
            const inst = paymentInstallments.find(
                (i) =>
                    i.payment_method_id === Number(p.payment_method_id) &&
                    i.installments === Number(p.installments)
            );
            return inst && inst.multiplier > 1;
        });
    }, [payments, paymentInstallments]);

    // Multiplicador de interés
    const multiplier = interestMethod
        ? paymentInstallments.find(
            (i) =>
                i.payment_method_id === Number(interestMethod.payment_method_id) &&
                i.installments === Number(interestMethod.installments)
        )?.multiplier || 1
        : 1;

    // Total final con recargo
    const totalWithSurcharge = useMemo(() => {
        if (!interestMethod) return baseTotalARS;
        const interestPart = saldo * (multiplier - 1);
        return baseTotalARS + interestPart;
    }, [baseTotalARS, saldo, multiplier, interestMethod]);

    // Cuánto lleva pagado el cliente
    const paidARS = useMemo(
        () => payments.reduce((acc, p) => acc + Number(p.amount || 0), 0),
        [payments]
    );

    // Saldo restante
    const remainingARS = useMemo(() => {
        return Math.max(totalWithSurcharge - paidARS, 0);
    }, [totalWithSurcharge, paidARS]);

    const getInstallmentsForMethod = (id) => {
        return paymentInstallments.filter((i) => i.payment_method_id === Number(id));
    };

    // =========================================================
    // GENERAR PRESUPUESTO
    // =========================================================
    const handlePreview = () => {
        if (selectedVariants.length === 0) return toast.error("Agregá al menos un producto.");
        if (!exchangeRate) return toast.error("Error obteniendo cotización.");

        const normalized = payments
            .map((p) => ({
                payment_method_id: p.payment_method_id,
                method_name: p.method_name,
                installments: p.installments || null,
                multiplier: p.multiplier || 1,
                amount: Number(p.amount || 0),
            }))
            .filter((p) => p.payment_method_id && p.amount > 0);

        if (!normalized.length) return toast.error("Agregá al menos un pago.");

        if (Math.round(paidARS) !== Math.round(totalWithSurcharge)) {
            return toast.error("El total pagado no coincide con el total final.");
        }

        const preview = {
            customer_name: selectedCustomer
                ? `${selectedCustomer.name} ${selectedCustomer.last_name || ""}`
                : "Consumidor Final",
            customer_phone: selectedCustomer ? selectedCustomer.phone : "",
            customer_email: selectedCustomer ? selectedCustomer.email : "",
            seller_name: profile?.name || "",
            seller_last_name: profile?.last_name || "",
            seller_phone: profile?.phone || "",
            seller_email: profile?.email || "",
            items: selectedVariants.map((v) => ({
                name: v.products.name,
                variant: v.variant_name,
                quantity: v.quantity,
                usd_price: v.usd_price,
                subtotal_usd: v.usd_price * v.quantity,
                subtotal_ars: v.usd_price * v.quantity * exchangeRate,
            })),
            subtotalUSD,
            subtotalARS: baseTotalARS,
            cotizacion: exchangeRate,
            paid: paidARS,
            remaining: remainingARS,
            payments: normalized,
            notes: "",
            total_final_ars: totalWithSurcharge,
        };

        setInvoiceData(preview);
        setInvoiceOpen(true);
    };

    // =========================================================
    // RENDER
    // =========================================================

    return (
        <div className="@container/main flex flex-1 flex-col gap-2 max-w-xl mx-auto">
            <div className=" py-6  space-y-10">
                {/* ======================= CLIENTE ===================== */}
                <section className="space-y-3">
                    <h2 className="font-semibold">Cliente</h2>

                    <div className="relative">
                        <Input
                            placeholder="Buscar cliente (opcional)"
                            value={
                                selectedCustomer
                                    ? `${selectedCustomer.name} ${selectedCustomer.last_name || ""}`
                                    : searchCustomer
                            }
                            onChange={(e) => {
                                setSelectedCustomer(null);
                                setSearchCustomer(e.target.value);
                            }}
                            onFocus={() => setFocusCustomer(true)}
                            onBlur={() => setTimeout(() => setFocusCustomer(false), 120)}
                            className="w-full"
                        />

                        {focusCustomer && (
                            <div className="border rounded-md bg-white shadow absolute top-full left-0 w-full z-50 mt-1">
                                <ScrollArea className="max-h-56 overflow-y-auto">
                                    {customers.map((c) => (
                                        <button
                                            key={c.id}
                                            className="block px-3 py-2 hover:bg-muted w-full text-left"
                                            onClick={() => {
                                                setSelectedCustomer(c);
                                                setFocusCustomer(false);
                                            }}
                                        >
                                            {c.name} {c.last_name} – {c.phone}
                                        </button>
                                    ))}
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                </section>

                {/* ======================= PRODUCTOS ===================== */}
                <section className="space-y-4 flex flex-col">
                    <h2 className="font-semibold">Productos</h2>

                    <div className="relative">
                        <Input
                            placeholder="Buscar productos…"
                            value={selectedProduct ? selectedProduct.name : searchProduct}
                            onChange={(e) => {
                                setSelectedProduct(null);
                                setSearchProduct(e.target.value);
                            }}
                            onFocus={() => setFocusProduct(true)}
                            onBlur={() => setTimeout(() => setFocusProduct(false), 120)}
                            className="w-full"
                        />

                        {focusProduct && (
                            <div className="border rounded-md bg-white shadow absolute top-full left-0 w-full z-50 mt-1">
                                <ScrollArea className="max-h-56 overflow-y-auto">
                                    {products.map((p) => (
                                        <button
                                            key={p.id}
                                            className="block px-3 py-2 hover:bg-muted w-full text-left"
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
                    </div>

                    {/* Variantes */}
                    <div className="relative">
                        <Input
                            placeholder="Buscar variantes…"
                            disabled={!selectedProduct}
                            value={searchVariant}
                            onChange={(e) => setSearchVariant(e.target.value)}
                            onFocus={() => setFocusVariant(true)}
                            onBlur={() => setTimeout(() => setFocusVariant(false), 120)}
                            className="w-full"
                        />

                        {focusVariant && selectedProduct && (
                            <div className="border rounded-md bg-white shadow absolute top-full left-0 w-full z-50 mt-1">
                                <ScrollArea className="max-h-56 overflow-y-auto">
                                    {variants.map((v) => (
                                        <button
                                            key={v.id}
                                            className="block px-3 py-2 hover:bg-muted w-full text-left"
                                            onClick={() => handleAddVariant(v)}
                                        >
                                            <div className="font-medium">{v.products.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {v.variant_name} {v.color && `• ${v.color}`} • ${v.usd_price} USD • Stock: {v.stock}
                                            </div>
                                        </button>
                                    ))}
                                </ScrollArea>
                            </div>
                        )}
                    </div>

                    {/* Carrito */}
                    {selectedVariants.length > 0 && (
                        <div className="space-y-3 border-t pt-4">
                            {selectedVariants.map((v) => (
                                <div
                                    key={v.id}
                                    className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border p-2 rounded-md"
                                >

                                    <div>
                                        <div className="font-medium">{v.products.name}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {v.variant_name} {v.color && `• ${v.color}`} • USD {v.usd_price} • Stock: {v.stock}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={v.quantity}
                                            className="w-auto text-center"
                                            min={1}
                                            onChange={(e) => {
                                                const qty = Number(e.target.value);
                                                if (qty >= 1) {
                                                    setSelectedVariants((prev) =>
                                                        prev.map((x) => (x.id === v.id ? { ...x, quantity: qty } : x))
                                                    );
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            onClick={() =>
                                                setSelectedVariants((prev) => prev.filter((x) => x.id !== v.id))
                                            }
                                        >
                                            <IconTrash className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            <div className="font-semibold text-right">
                                Subtotal: {formatARS(baseTotalARS)}
                            </div>
                        </div>
                    )}
                </section>

                {/* ======================= PAGOS ===================== */}
                <section className="space-y-4">
                    <h2 className="font-semibold">Pagos</h2>

                    {payments.map((p, i) => (
                        <div key={i} className="border p-3 rounded-md space-y-3 bg-muted/40">
                            <div className="flex items-center gap-3">
                                <Select
                                    value={p.payment_method_id || ""}
                                    onValueChange={(val) => {
                                        const chosen = paymentMethods.find((m) => m.id == val);
                                        setPayments((prev) =>
                                            prev.map((row, idx) =>
                                                idx === i
                                                    ? {
                                                        ...row,
                                                        payment_method_id: val,
                                                        method_name: chosen?.name || "",
                                                        multiplier: chosen?.multiplier || 1,
                                                        installments: "",
                                                    }
                                                    : row
                                            )
                                        );
                                    }}
                                >
                                    <SelectTrigger className="w-auto min-w-[140px]">
                                        <SelectValue placeholder="Método de pago..." />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 max-h-64 overflow-y-auto">
                                        {paymentMethods.map((m) => (
                                            <SelectItem key={m.id} value={String(m.id)}>
                                                {m.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {getInstallmentsForMethod(p.payment_method_id).length > 0 && (
                                    <Select
                                        value={p.installments || ""}
                                        onValueChange={(val) => {
                                            const inst = paymentInstallments.find(
                                                (x) =>
                                                    x.payment_method_id === Number(p.payment_method_id) &&
                                                    x.installments === Number(val)
                                            );
                                            setPayments((prev) =>
                                                prev.map((row, idx) =>
                                                    idx === i
                                                        ? {
                                                            ...row,
                                                            installments: val,
                                                            multiplier: inst?.multiplier || 1,
                                                        }
                                                        : row
                                                )
                                            );
                                        }}
                                    >
                                        <SelectTrigger className="w-auto min-w-[80px]">
                                            <SelectValue placeholder="Cuotas" />
                                        </SelectTrigger>
                                        <SelectContent className="z-50 max-h-64 overflow-y-auto">
                                            {getInstallmentsForMethod(p.payment_method_id).map((x) => (
                                                <SelectItem key={x.id} value={String(x.installments)}>
                                                    {x.installments}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                        cuotas
                                    </Select>
                                )}

                                {payments.length > 1 && (
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        onClick={() =>
                                            setPayments((prev) => prev.filter((_, idx) => idx !== i))
                                        }
                                    >
                                        <IconTrash className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            <div className="flex gap-2 items-end">
                                <Input
                                    placeholder="Monto (ARS)"
                                    value={p.amount}
                                    type="number"
                                    className="w-auto flex-1"
                                    onChange={(e) =>
                                        setPayments((prev) =>
                                            prev.map((row, idx) =>
                                                idx === i ? { ...row, amount: e.target.value } : row
                                            )
                                        )
                                    }
                                />
                                {i === payments.length - 1 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={
                                            !p.payment_method_id ||
                                            (getInstallmentsForMethod(p.payment_method_id).length > 0 &&
                                                !p.installments)
                                        }
                                        onClick={() => {
                                            if (
                                                !p.payment_method_id ||
                                                (getInstallmentsForMethod(p.payment_method_id).length > 0 &&
                                                    !p.installments)
                                            )
                                                return;
                                            setPayments((prev) =>
                                                prev.map((row, idx) =>
                                                    idx === i ? { ...row, amount: String(remainingARS) } : row
                                                )
                                            );
                                        }}
                                    >
                                        Restante
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}

                    <Button variant="outline" className="w-full" onClick={() =>
                        setPayments((prev) => [...prev, { payment_method_id: "", method_name: "", amount: "", installments: "", reference: "" }])
                    }>
                        <IconCirclePlus className="h-4 w-4" />
                        Agregar pago
                    </Button>
                </section>

                {/* ======================= RESUMEN ===================== */}
                <section className="space-y-2 border-t pt-4 text-sm">
                    <div className="flex justify-between">
                        <span>Total USD:</span>
                        <span className="font-semibold">{subtotalUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Cotización:</span>
                        <span>${exchangeRate}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Total base ARS:</span>
                        <span className="font-bold text-primary">{formatARS(baseTotalARS)}</span>
                    </div>

                    {interestMethod && (
                        <>
                            <div className="flex justify-between text-blue-600">
                                <span>Recargo ({interestMethod.method_name} {interestMethod.installments} cuotas):</span>
                                <span className="font-semibold">{formatARS(totalWithSurcharge - baseTotalARS)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-blue-600 border-t pt-2">
                                <span>Total con recargo:</span>
                                <span>{formatARS(totalWithSurcharge)}</span>
                            </div>
                        </>
                    )}

                    <div className="flex justify-between">
                        <span>Pagado:</span>
                        <span className={paidARS > 0 ? "font-semibold" : ""}>{formatARS(paidARS)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Restante:</span>
                        <span className={`font-semibold ${remainingARS === 0 ? "text-green-600" : "text-blue-600"}`}>
                            {formatARS(remainingARS)}
                        </span>
                    </div>
                </section>

                <Button
                    className="w-full"
                    disabled={selectedVariants.length === 0}
                    onClick={handlePreview}
                >
                    Generar presupuesto
                </Button>

                {/* ======================= MODAL ===================== */}
                {invoiceData && (
                    <DialogQuoteInvoice
                        open={invoiceOpen}
                        onClose={() => setInvoiceOpen(false)}
                        quote={invoiceData}
                    />
                )}
            </div>
        </div>
    );
}
