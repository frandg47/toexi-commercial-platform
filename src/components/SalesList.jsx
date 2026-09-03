"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAdminSales } from "../utils/getAdminSales";
import { getReceivedItems, getTotalReceivedArs } from "@/utils/tradeInHelpers";

import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationPrevious,
    PaginationNext,
    PaginationEllipsis,
} from "@/components/ui/pagination";


import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContextProvider";
import { supabase } from "@/lib/supabaseClient";
import { formatPersonName } from "@/utils/formatName";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";

import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";

import { IconCalendar, IconRefresh, IconDownload, IconShieldCheck } from "@tabler/icons-react";
import { generateSalePDF } from "@/utils/generateSalePDF";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";
const AR_OFFSET = "-03:00";

const toDateKeyAR = (date) =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: AR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);

const toTimestampAR = (date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: AR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const get = (type) => parts.find((p) => p.type === type)?.value || "00";
    const yyyy = get("year");
    const mm = get("month");
    const dd = get("day");
    const hh = get("hour");
    const min = get("minute");
    const ss = get("second");

    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${AR_OFFSET}`;
};

const formatVariantLabel = (item) => {
    if (!item) return "-";
    const parts = [item.product_name, item.variant_name, item.color && `(${item.color})`]
        .filter(Boolean);
    return parts.join(" ");
};

const formatWarrantyBucket = (bucket) =>
    bucket === "defective" ? "Defectuoso" : "Disponible";



const normalizeIdentifier = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const isSerialTrackedVariant = (variant) =>
    variant?.products?.inventory_tracking_mode === "serial";



const getPaymentDisplayCurrency = (methodName) => {
    const upper = methodName?.toUpperCase();
    if (upper === "USDT") return "USDT";
    if (upper === "USD") return "USD";
    return "ARS";
};

export function SalesList() {
    const [sales, setSales] = useState([]);
    const [page, setPage] = useState(1);
    const [count, setCount] = useState(0);
    const { role, id_auth } = useAuth();
    const normalizedRole = `${role || ""}`.trim().toLowerCase();
    const isOwner = normalizedRole === "owner";
    const canManageSaleActions =
        normalizedRole === "owner" || normalizedRole === "superadmin";
    const [auditUsers, setAuditUsers] = useState({});
    const [sellerOptions, setSellerOptions] = useState([]);
    const [editOpen, setEditOpen] = useState(false);
    const [editingSale, setEditingSale] = useState(null);
    const [editDate, setEditDate] = useState(null);
    const [editTime, setEditTime] = useState("09:00");
    const [editSellerId, setEditSellerId] = useState("");
    const [editChannelId, setEditChannelId] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);
    const [channels, setChannels] = useState([]);
    const getAuditUserLabel = (userId) => {
        if (!userId) return "-";
        const user = auditUsers[userId];
        if (!user) return userId;
        const name = formatPersonName(user.name, user.last_name);
        return name || user.email || userId;
    };
    const sellerLabelById = useMemo(() => {
        const map = {};
        (sellerOptions || []).forEach((seller) => {
            map[seller.id_auth] =
                [seller.name, seller.last_name].filter(Boolean).join(" ") ||
                seller.email ||
                seller.id_auth;
        });
        return map;
    }, [sellerOptions]);
    const channelLabelById = useMemo(() => {
        const map = {};
        (channels || []).forEach((ch) => {
            map[String(ch.id)] = ch.name || String(ch.id);
        });
        return map;
    }, [channels]);
    const renderUpdatedField = (fieldKey, payload) => {
        const oldValue = payload?.old ?? "-";
        const newValue = payload?.new ?? "-";
        if (fieldKey === "seller_id") {
            return (
                <span>
                    Vendedor: {sellerLabelById[oldValue] || oldValue} →{" "}
                    {sellerLabelById[newValue] || newValue}
                </span>
            );
        }
        if (fieldKey === "sales_channel_id") {
            return (
                <span>
                    Canal: {channelLabelById[String(oldValue)] || oldValue} →{" "}
                    {channelLabelById[String(newValue)] || newValue}
                </span>
            );
        }
        if (fieldKey === "sale_date") {
            const oldDate = oldValue
                ? new Date(oldValue).toLocaleString("es-AR", {
                      timeZone: AR_TIMEZONE,
                      hour12: false,
                  })
                : "-";
            const newDate = newValue
                ? new Date(newValue).toLocaleString("es-AR", {
                      timeZone: AR_TIMEZONE,
                      hour12: false,
                  })
                : "-";
            return <span>Fecha: {oldDate} → {newDate}</span>;
        }
        return (
            <span>
                {fieldKey}: {String(oldValue)} → {String(newValue)}
            </span>
        );
    };
    const normalizeUpdatedFields = (value) => {
        if (!value) return null;
        if (typeof value === "object") return value;
        if (typeof value !== "string") return null;
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    };


    // 📌 Estados para anulación
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelingSale, setCancelingS] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [bucketOpen, setBucketOpen] = useState(false);
    const [selectedBucket, setSelectedBucket] = useState("available");
    const [cancelingProcess, setCancelingProcess] = useState(false);
    const [canjeReceivedUnits, setCanjeReceivedUnits] = useState([]);
    const [deleteCanjeUnit, setDeleteCanjeUnit] = useState(true);

    // 📌 Estados para cancelar venta (solo ocultar de caja)
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
    const [confirmCancelSale, setConfirmCancelSale] = useState(null);
    const [confirmCancelProcessing, setConfirmCancelProcessing] = useState(false);
    const [warrantyOpen, setWarrantyOpen] = useState(false);
    const [warrantyProcessing, setWarrantyProcessing] = useState(false);
    const [warrantySale, setWarrantySale] = useState(null);
    const [warrantyItems, setWarrantyItems] = useState([]);
    const [replacementOptions, setReplacementOptions] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [paymentInstallments, setPaymentInstallments] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [isRegisterOpen, setIsRegisterOpen] = useState(false);
    const [fxRate, setFxRate] = useState(null);
    const [usdtRate, setUsdtRate] = useState(null);
    const [selectedWarrantyItemId, setSelectedWarrantyItemId] = useState("");
    const [warrantyReturnBucket, setWarrantyReturnBucket] = useState("defective");
    const [warrantyReplacementRows, setWarrantyReplacementRows] = useState([]);
    const [warrantyProductSearch, setWarrantyProductSearch] = useState("");
    const [warrantyReason, setWarrantyReason] = useState("");
    const [warrantyNotes, setWarrantyNotes] = useState("");
    const [warrantySettlementAccountId, setWarrantySettlementAccountId] = useState("");
    const [warrantySettlementMethodId, setWarrantySettlementMethodId] = useState("");
    const [warrantySettlementInstallments, setWarrantySettlementInstallments] = useState("");
    const [warrantySettlementMode, setWarrantySettlementMode] = useState("none");
    const [warrantyManualAmountArs, setWarrantyManualAmountArs] = useState("");
    const [warrantiesBySale, setWarrantiesBySale] = useState({});
    const selectedWarrantyItem = useMemo(
        () =>
            warrantyItems.find(
                (item) =>
                    String(item.warranty_selection_id || item.id) ===
                    String(selectedWarrantyItemId),
            ) ||
            null,
        [warrantyItems, selectedWarrantyItemId],
    );
    const filteredReplacementOptions = useMemo(() => {
        const search = warrantyProductSearch.trim().toLowerCase();
        if (!search) return replacementOptions;
        return replacementOptions.filter((variant) =>
            formatVariantLabel({
                product_name: variant.products?.name,
                variant_name: variant.variant_name,
                color: variant.color,
            })
                .toLowerCase()
                .includes(search),
        );
    }, [replacementOptions, warrantyProductSearch]);
    const replacementRowsDetailed = useMemo(
        () =>
            warrantyReplacementRows.map((row, index) => {
                const variant =
                    replacementOptions.find(
                        (item) => String(item.id) === String(row.variant_id),
                    ) || null;
                const quantity = Number(row.quantity || 0);
                const unitPriceUsd = Number(variant?.usd_price || 0);
                return {
                    ...row,
                    index,
                    variant,
                    quantity,
                    unitPriceUsd,
                    subtotalUsd: Number((unitPriceUsd * quantity).toFixed(2)),
                };
            }),
        [replacementOptions, warrantyReplacementRows],
    );
    const selectedSettlementMethod = useMemo(
        () =>
            paymentMethods.find(
                (method) => String(method.id) === String(warrantySettlementMethodId),
            ) || null,
        [paymentMethods, warrantySettlementMethodId],
    );
    const settlementInstallmentOptions = useMemo(
        () =>
            paymentInstallments.filter(
                (inst) =>
                    inst.payment_method_id === Number(warrantySettlementMethodId),
            ),
        [paymentInstallments, warrantySettlementMethodId],
    );

    const displayAccounts = useMemo(() => {
        if (isRegisterOpen) return accounts.filter((a) => !a.is_efectivo && !a.is_caja_virtual);
        return accounts;
    }, [accounts, isRegisterOpen]);
    const warrantyPriceDiff = useMemo(() => {
        if (!selectedWarrantyItem || replacementRowsDetailed.length === 0) {
            return {
                originalTotalUsd: 0,
                replacementTotalUsd: 0,
                differenceUsd: 0,
                differenceArs: 0,
                storeCreditUsd: 0,
            };
        }

        const originalTotalUsd = Number(
            selectedWarrantyItem.subtotal_usd ||
                Number(selectedWarrantyItem.usd_price || 0) *
                    Number(selectedWarrantyItem.quantity || 1) ||
                0,
        );
        const replacementTotalUsd = replacementRowsDetailed.reduce(
            (acc, row) => acc + Number(row.subtotalUsd || 0),
            0,
        );
        const differenceUsd = Number((replacementTotalUsd - originalTotalUsd).toFixed(2));
        const differenceArs = fxRate
            ? Number((differenceUsd * Number(fxRate)).toFixed(2))
            : 0;

        return {
            originalTotalUsd,
            replacementTotalUsd,
            differenceUsd,
            differenceArs,
            storeCreditUsd: differenceUsd < 0 ? Math.abs(differenceUsd) : 0,
        };
    }, [replacementRowsDetailed, selectedWarrantyItem, fxRate]);
    const selectedSettlementAccount = useMemo(
        () =>
            displayAccounts.find(
                (account) =>
                    String(account.id) === String(warrantySettlementAccountId),
            ) || null,
        [displayAccounts, warrantySettlementAccountId],
    );
    const settlementMultiplier = useMemo(() => {
        if (!selectedSettlementMethod) return 1;
        if (settlementInstallmentOptions.length === 0) {
            return Number(selectedSettlementMethod.multiplier || 1);
        }
        const selectedInstallment = settlementInstallmentOptions.find(
            (inst) =>
                inst.installments === Number(warrantySettlementInstallments),
        );
        return Number(
            selectedInstallment?.multiplier ||
                selectedSettlementMethod.multiplier ||
                1,
        );
    }, [
        selectedSettlementMethod,
        settlementInstallmentOptions,
        warrantySettlementInstallments,
    ]);
    const settlementAccounts = useMemo(() => {
        if (!selectedSettlementMethod) return displayAccounts;
        const currency = getPaymentDisplayCurrency(selectedSettlementMethod.name);
        return displayAccounts.filter((account) => account.currency === currency);
    }, [displayAccounts, selectedSettlementMethod]);
    const warrantySettlementPreview = useMemo(() => {
        if (!selectedSettlementAccount || Math.abs(warrantyPriceDiff.differenceUsd) <= 0.009) {
            return null;
        }

        const absoluteUsd = Math.abs(warrantyPriceDiff.differenceUsd);
        const currency = selectedSettlementAccount.currency;
        const multiplier = settlementMultiplier > 0 ? settlementMultiplier : 1;

        if (currency === "ARS") {
            if (!fxRate) return null;
            const amount = Number((absoluteUsd * Number(fxRate) * multiplier).toFixed(2));
            return {
                currency,
                amount,
                amount_ars: amount,
                fx_rate_used: Number(fxRate),
            };
        }

        if (currency === "USDT") {
            const amount = Number((absoluteUsd * multiplier).toFixed(2));
            return {
                currency,
                amount,
                amount_ars: usdtRate
                    ? Number((amount * Number(usdtRate)).toFixed(2))
                    : null,
                fx_rate_used: usdtRate ? Number(usdtRate) : null,
            };
        }

        const amount = Number((absoluteUsd * multiplier).toFixed(2));
        return {
            currency,
            amount,
            amount_ars: fxRate ? Number((amount * Number(fxRate)).toFixed(2)) : null,
            fx_rate_used: fxRate ? Number(fxRate) : null,
        };
    }, [
        fxRate,
        selectedSettlementAccount,
        settlementMultiplier,
        usdtRate,
        warrantyPriceDiff.differenceUsd,
    ]);

    // �📌 Filtros unificados
    const [filters, setFilters] = useState({
        start_date: "",
        end_date: "",
        seller_id: "",
        status: "",
    });

    // 📌 Fecha inicial (mes actual)
    const getDefaultMonthRange = () => {
        const start = new Date();
        start.setDate(1);
        const end = new Date();
        return { from: start, to: end };
    };

    const getDefaultWeekRange = () => {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay() + 1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { from: start, to: end };
    };

    const [dateRange, setDateRange] = useState(getDefaultMonthRange());
    const [refreshing, setRefreshing] = useState(false);

    // 📌 Actualiza filtros cuando cambia el calendario
    useEffect(() => {
        if (dateRange?.from) {
            // Sumar 1 día a la fecha final para incluir todo el último día
            const endDate = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
            endDate.setDate(endDate.getDate() + 1);

            setFilters((f) => ({
                ...f,
                start_date: toDateKeyAR(dateRange.from),
                end_date: toDateKeyAR(endDate),
            }));
        }
    }, [dateRange]);

    useEffect(() => {
        if (!canManageSaleActions) return;

        const fetchSellers = async () => {
            const { data, error } = await supabase
                .from("users")
                .select("id_auth, name, last_name, email")
                .in("role", ["seller", "superadmin"])
                .eq("is_active", true)
                .order("name", { ascending: true });

            if (error) {
                console.error(error);
                return;
            }

            setSellerOptions(data || []);
        };

        const fetchChannels = async () => {
            const { data, error } = await supabase
                .from("sales_channels")
                .select("id, name")
                .eq("is_active", true)
                .order("name", { ascending: true });

            if (error) {
                console.error(error);
                return;
            }

            setChannels(data || []);
        };

        const fetchWarrantyHelpers = async () => {
            const [
                { data: paymentMethodsData, error: paymentMethodsError },
                { data: paymentInstallmentsData, error: paymentInstallmentsError },
                { data: accountsData, error: accountsError },
                { data: blueRateData, error: blueRateError },
                { data: usdtRateData, error: usdtRateError },
            ] = await Promise.all([
                supabase
                    .from("payment_methods")
                    .select("id, name, multiplier")
                    .eq("is_active", true)
                    .order("name", { ascending: true }),
                supabase
                    .from("payment_installments")
                    .select("id, payment_method_id, installments, multiplier"),
                supabase
                    .from("accounts")
                    .select("id, name, currency, is_reference_capital, is_efectivo, is_caja_virtual")
                    .eq("is_reference_capital", false)
                    .order("name", { ascending: true }),
                supabase
                    .from("fx_rates")
                    .select("rate")
                    .eq("source", "blue")
                    .eq("is_active", true)
                    .order("updated_at", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from("fx_rates")
                    .select("rate")
                    .eq("source", "usdt")
                    .eq("is_active", true)
                    .order("updated_at", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
            ]);

            if (!paymentMethodsError) {
                setPaymentMethods(paymentMethodsData || []);
            }
            if (!paymentInstallmentsError) {
                setPaymentInstallments(paymentInstallmentsData || []);
            }
            if (!accountsError) {
                setAccounts(accountsData || []);
            }
            if (!blueRateError) {
                setFxRate(blueRateData?.rate ? Number(blueRateData.rate) : null);
            }
            if (!usdtRateError) {
                setUsdtRate(usdtRateData?.rate ? Number(usdtRateData.rate) : null);
            }
        };

        fetchSellers();
        fetchChannels();
        fetchWarrantyHelpers();
    }, [canManageSaleActions]);

    useEffect(() => {
        const checkRegister = async () => {
            const { data } = await supabase
                .from("cash_registers")
                .select("id")
                .eq("status", "open")
                .maybeSingle();
            setIsRegisterOpen(!!data);
        };
        checkRegister();
    }, []);

    const load = useCallback(async () => {
        try {
            setRefreshing(true);
            const { data, count } = await getAdminSales(page, filters);
            const rows = data || [];
            setSales(rows);
            setCount(count || 0);

            const saleIds = rows.map((sale) => sale.sale_id).filter(Boolean);
            if (saleIds.length > 0) {
                const { data: warrantiesData, error: warrantiesError } = await supabase
                    .from("warranty_exchanges")
                    .select(
                        "id, sale_id, sale_item_id, original_imei, replacement_imei, quantity, returned_stock_bucket, reason, notes, created_at, price_difference_usd, settlement_type, settlement_currency, settlement_amount, settlement_installments, settlement_multiplier, store_credit_usd, store_credit_amount_ars, warranty_sale_id, settlement_method:payment_methods!warranty_exchanges_settlement_payment_method_id_fkey(id, name), original_variant:product_variants!warranty_exchanges_original_variant_id_fkey(id, variant_name, color, products(name)), replacement_variant:product_variants!warranty_exchanges_replacement_variant_id_fkey(id, variant_name, color, products(name))",
                    )
                    .in("sale_id", saleIds)
                    .order("created_at", { ascending: false });

                if (!warrantiesError) {
                    const warrantyIds = (warrantiesData || []).map((warranty) => warranty.id);
                    let warrantyItemsMap = {};

                    if (warrantyIds.length > 0) {
                        const { data: replacementItemsData, error: replacementItemsError } =
                            await supabase
                                .from("warranty_exchange_items")
                                .select(
                                    "id, warranty_exchange_id, imei, quantity, unit_price_usd, subtotal_usd, variant:product_variants(id, variant_name, color, products(name))",
                                )
                                .in("warranty_exchange_id", warrantyIds)
                                .order("id", { ascending: true });

                        if (!replacementItemsError) {
                            warrantyItemsMap = (replacementItemsData || []).reduce(
                                (acc, item) => {
                                    if (!acc[item.warranty_exchange_id]) {
                                        acc[item.warranty_exchange_id] = [];
                                    }
                                    acc[item.warranty_exchange_id].push(item);
                                    return acc;
                                },
                                {},
                            );
                        }
                    }

                    const grouped = {};
                    (warrantiesData || []).forEach((warranty) => {
                        const mergedWarranty = {
                            ...warranty,
                            replacement_items: warrantyItemsMap[warranty.id] || [],
                        };
                        if (!grouped[warranty.sale_id]) grouped[warranty.sale_id] = [];
                        grouped[warranty.sale_id].push(mergedWarranty);
                    });
                    setWarrantiesBySale(grouped);
                } else {
                    setWarrantiesBySale({});
                }
            } else {
                setWarrantiesBySale({});
            }

            const auditIds = Array.from(
                new Set(
                    rows
                        .flatMap((s) => [s?.voided_by, s?.updated_by])
                        .filter(Boolean)
                )
            );
            if (auditIds.length > 0) {
                const { data: usersData, error: usersError } = await supabase
                    .from("users")
                    .select("id_auth, name, last_name, email")
                    .in("id_auth", auditIds);
                if (!usersError) {
                    const mapped = {};
                    (usersData || []).forEach((u) => {
                        mapped[u.id_auth] = u;
                    });
                    setAuditUsers(mapped);
                }
            } else {
                setAuditUsers({});
            }
        } catch (err) {
            toast.error("Error al cargar ventas");
        } finally {
            setRefreshing(false);
        }
    }, [page, filters]);

    useEffect(() => {
        load();
    }, [load]);

    const totalPages = Math.ceil(count / 10);
    const openEditSale = (sale) => {
        if (!isOwner) {
            toast.error("Solo el owner puede editar ventas");
            return;
        }
        const saleDate = sale?.sale_date ? new Date(sale.sale_date) : new Date();
        const hh = String(saleDate.getHours()).padStart(2, "0");
        const mm = String(saleDate.getMinutes()).padStart(2, "0");

        setEditingSale(sale);
        setEditDate(saleDate);
        setEditTime(`${hh}:${mm}`);
        setEditSellerId(sale?.seller_id || "");
        setEditChannelId(sale?.sales_channel_id ? String(sale.sales_channel_id) : "");
        setEditOpen(true);
    };

    const closeEditSale = () => {
        setEditOpen(false);
        setEditingSale(null);
        setEditChannelId("");
    };

    const handleSaveEdit = async () => {
        if (!editingSale) return;

        // Validar que no sea una venta anulada o cancelada
        if (editingSale.status === "anulado" || editingSale.status === "cancelado") {
            toast.error("No se puede editar una venta anulada o cancelada");
            return;
        }

        if (!editDate || !editTime) {
            toast.error("Selecciona fecha y hora");
            return;
        }

        const [hh, mm] = editTime.split(":");
        const nextDate = new Date(editDate);
        nextDate.setHours(Number(hh), Number(mm), 0, 0);

        const payload = {
            sale_date: toTimestampAR(nextDate),
        };

        if (editSellerId) {
            payload.seller_id = editSellerId;
        }

        if (editChannelId) {
            payload.sales_channel_id = editChannelId;
        }

        try {
            setSavingEdit(true);
            const auditPayload = {
                ...payload,
                ...(id_auth ? { updated_by: id_auth } : {}),
                updated_at: new Date().toISOString(),
            };

            let { error } = await supabase
                .from("sales")
                .update(auditPayload)
                .eq("id", editingSale.sale_id);

            if (error) {
                const msg = `${error?.message || ""}`.toLowerCase();
                if (
                    msg.includes("column") &&
                    (msg.includes("updated_by") || msg.includes("updated_at"))
                ) {
                    ({ error } = await supabase
                        .from("sales")
                        .update(payload)
                        .eq("id", editingSale.sale_id));
                }
            }

            if (error) throw error;
            console.log("payload edit", payload, editingSale);


            toast.success("Venta actualizada");
            closeEditSale();
            load();
        } catch (err) {
            toast.error("No se pudo actualizar la venta", {
                description: err?.message,
            });
        } finally {
            setSavingEdit(false);
        }
    };

    const fetchCanjeReceivedUnits = async (saleId) => {
        const { data } = await supabase
            .from("inventory_units")
            .select("id, variant_id, identifier_value")
            .eq("sale_id", saleId)
            .ilike("notes", "%plan canje%")
            .is("sale_item_id", null);
        return data || [];
    };

    const startCancelSale = async (sale) => {
        if (!canManageSaleActions) {
            toast.error("Solo owner o superadmin puede anular ventas");
            return;
        }
        setCancelingS(sale);
        setCancelReason("");
        setDeleteCanjeUnit(true);
        if (sale.sale_type === "canje") {
            const units = await fetchCanjeReceivedUnits(sale.sale_id);
            setCanjeReceivedUnits(units);
        } else {
            setCanjeReceivedUnits([]);
        }
        setCancelOpen(true);
    };

    const closeCancelDialog = () => {
        setCancelOpen(false);
        setCancelingS(null);
        setCancelReason("");
        setCanjeReceivedUnits([]);
        setDeleteCanjeUnit(true);
    };

    const startConfirmCancelSale = async (sale) => {
        if (!canManageSaleActions) {
            toast.error("Solo owner o superadmin puede cancelar ventas");
            return;
        }
        setConfirmCancelSale(sale);
        setDeleteCanjeUnit(true);
        if (sale.sale_type === "canje") {
            const units = await fetchCanjeReceivedUnits(sale.sale_id);
            setCanjeReceivedUnits(units);
        } else {
            setCanjeReceivedUnits([]);
        }
        setConfirmCancelOpen(true);
    };

    const closeConfirmCancelDialog = () => {
        setConfirmCancelOpen(false);
        setConfirmCancelSale(null);
        setCanjeReceivedUnits([]);
        setDeleteCanjeUnit(true);
    };

    const proceedCancelSale = async () => {
        if (!confirmCancelSale) return;
        try {
            setConfirmCancelProcessing(true);

            // Fetch sale items to return stock
            const { data: saleItems, error: itemsErr } = await supabase
                .from("sale_items")
                .select("id, variant_id, quantity")
                .eq("sale_id", confirmCancelSale.sale_id);

            if (itemsErr) throw itemsErr;

            // Return stock per item
            for (const item of (saleItems || [])) {
                if (item.variant_id) {
                    // Increment variant stock
                    const { data: variant, error: vErr } = await supabase
                        .from("product_variants")
                        .select("stock")
                        .eq("id", item.variant_id)
                        .single();
                    if (vErr) throw vErr;

                    const { error: upErr } = await supabase
                        .from("product_variants")
                        .update({ stock: (variant?.stock || 0) + item.quantity })
                        .eq("id", item.variant_id);
                    if (upErr) throw upErr;
                }

                // For serial-tracked items: reset inventory_units linked via sale_item_imeis
                const { data: imeis } = await supabase
                    .from("sale_item_imeis")
                    .select("inventory_unit_id")
                    .eq("sale_item_id", item.id);

                for (const row of (imeis || [])) {
                    const { error: iuErr } = await supabase
                        .from("inventory_units")
                        .update({
                            status: "available",
                            sale_id: null,
                            sale_item_id: null,
                            sold_at: null,
                            returned_at: new Date().toISOString(),
                        })
                        .eq("id", row.inventory_unit_id);
                    if (iuErr) throw iuErr;

                    const { error: evErr } = await supabase
                        .from("inventory_unit_events")
                        .insert({
                            inventory_unit_id: row.inventory_unit_id,
                            event_type: "sale_cancelled",
                            from_status: "sold",
                            to_status: "available",
                            notes: `Venta #${confirmCancelSale.sale_id} cancelada`,
                        });
                    if (evErr) throw evErr;
                }
            }

            // Eliminar unidad recibida por canje si se eligió
            if (deleteCanjeUnit && canjeReceivedUnits.length > 0) {
                for (const canjeUnit of canjeReceivedUnits) {
                    await supabase.from("inventory_units").delete().eq("id", canjeUnit.id);
                }
            }

            // Update sale status
            const { error } = await supabase
                .from("sales")
                .update({ status: "cancelado" })
                .eq("id", confirmCancelSale.sale_id);
            if (error) throw error;

            toast.success("Venta cancelada correctamente y stock devuelto");
            window.dispatchEvent(new Event("sale-cancelled"));
            closeConfirmCancelDialog();
            load();
        } catch (err) {
            toast.error("No se pudo cancelar la venta", {
                description: err?.message,
            });
        } finally {
            setConfirmCancelProcessing(false);
        }
    };

    const proceedToBucketSelection = () => {
        if (!cancelReason.trim()) {
            toast.error("Debes ingresar un motivo de anulación");
            return;
        }
        setCancelOpen(false);
        setBucketOpen(true);
    };

    const closeBucketDialog = () => {
        setBucketOpen(false);
        setSelectedBucket("available");
        setCanjeReceivedUnits([]);
        setDeleteCanjeUnit(true);
    };

    const completeCancelSale = async () => {
        if (!cancelingSale) return;

        try {
            setCancelingProcess(true);
            const { error } = await supabase.rpc("void_sale", {
                p_sale_id: cancelingSale.sale_id,
                p_reason: cancelReason,
                p_bucket: selectedBucket,
                p_delete_canje_unit: deleteCanjeUnit,
            });

            if (error) throw error;

            toast.success("Venta anulada correctamente");
            window.dispatchEvent(new Event("sale-cancelled"));
            closeBucketDialog();
            setCancelingS(null);
            setCancelReason("");
            load();
        } catch (err) {
            toast.error("No se pudo anular la venta", {
                description: err?.message,
            });
        } finally {
            setCancelingProcess(false);
        }
    };

    const closeWarrantyDialog = () => {
        setWarrantyOpen(false);
        setWarrantyProcessing(false);
        setWarrantySale(null);
        setWarrantyItems([]);
        setReplacementOptions([]);
        setSelectedWarrantyItemId("");
        setWarrantyReturnBucket("defective");
        setWarrantyReplacementRows([]);
        setWarrantyProductSearch("");
        setWarrantyReason("");
        setWarrantyNotes("");
        setWarrantySettlementAccountId("");
        setWarrantySettlementMethodId("");
        setWarrantySettlementInstallments("");
        setWarrantySettlementMode("none");
        setWarrantyManualAmountArs("");
    };

    const createWarrantyReplacementRow = (variantId = "", quantity = 1) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        variant_id: variantId ? String(variantId) : "",
        quantity: String(quantity),
        imei: "",
        inventory_unit_id: null,
    });

    const updateWarrantyReplacementRow = (rowId, patch) => {
        setWarrantyReplacementRows((prev) =>
            prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
        );
    };

    const addWarrantyReplacementRow = (variantId = "", quantity = 1) => {
        setWarrantyReplacementRows((prev) => [
            ...prev,
            createWarrantyReplacementRow(variantId, quantity),
        ]);
    };

    const removeWarrantyReplacementRow = (rowId) => {
        setWarrantyReplacementRows((prev) =>
            prev.length > 1 ? prev.filter((row) => row.id !== rowId) : prev,
        );
    };

    const openWarrantyDialog = async (sale) => {
        if (!canManageSaleActions) {
            toast.error("Solo owner o superadmin puede gestionar garantias");
            return;
        }
        if (sale.status === "anulado" || sale.status === "cancelado") {
            toast.error("No se puede gestionar garantia sobre una venta anulada o cancelada");
            return;
        }

        try {
            const [
                { data: itemsData, error: itemsError },
                { data: variantsData, error: variantsError },
            ] =
                await Promise.all([
                    supabase
                        .from("sale_items")
                        .select("id, sale_id, variant_id, product_name, variant_name, color, quantity, imei, usd_price, subtotal_usd")
                        .eq("sale_id", sale.sale_id)
                        .not("variant_id", "is", null)
                        .order("id", { ascending: true }),
                    supabase
                        .from("product_variants")
                        .select("id, variant_name, color, stock, usd_price, products(name, active, inventory_tracking_mode)")
                        .gt("stock", 0)
                        .order("id", { ascending: true }),
                ]);

            if (itemsError) throw itemsError;
            if (variantsError) throw variantsError;

            const itemIds = (itemsData || []).map((item) => item.id).filter(Boolean);
            let itemImeisData = [];
            if (itemIds.length > 0) {
                const { data: fetchedImeis, error: itemImeisError } = await supabase
                    .from("sale_item_imeis")
                    .select("id, sale_item_id, imei, inventory_unit_id")
                    .in("sale_item_id", itemIds);
                if (itemImeisError) throw itemImeisError;
                itemImeisData = fetchedImeis || [];
            }

            const imeisBySaleItem = (itemImeisData || []).reduce((acc, itemImei) => {
                if (!acc[itemImei.sale_item_id]) acc[itemImei.sale_item_id] = [];
                acc[itemImei.sale_item_id].push(itemImei);
                return acc;
            }, {});

            const validItems = (itemsData || [])
                .filter((item) => item.variant_id && Number(item.quantity || 0) > 0)
                .flatMap((item) => {
                    const serialUnits = (imeisBySaleItem[item.id] || []).filter(
                        (unit) => unit.inventory_unit_id,
                    );
                    if (serialUnits.length === 0) {
                        return [
                            {
                                ...item,
                                sale_item_id: item.id,
                                warranty_selection_id: `sale-item:${item.id}`,
                            },
                        ];
                    }

                    return serialUnits.map((unit) => ({
                        ...item,
                        sale_item_id: item.id,
                        quantity: 1,
                        imei: unit.imei,
                        inventory_unit_id: unit.inventory_unit_id,
                        warranty_selection_id: `sale-item:${item.id}:unit:${unit.inventory_unit_id}`,
                    }));
                });
            const validVariants = (variantsData || []).filter(
                (variant) => variant.products?.active !== false,
            );

            if (validItems.length === 0) {
                toast.error("La venta no tiene items validos para gestionar garantia");
                return;
            }

            if (validVariants.length === 0) {
                toast.error("No hay variantes activas con stock para reemplazo");
                return;
            }

            const defaultItem = validItems[0];
            setWarrantySale(sale);
            setWarrantyItems(validItems);
            setReplacementOptions(validVariants);
            setSelectedWarrantyItemId(
                String(defaultItem.warranty_selection_id || defaultItem.id),
            );
            setWarrantyReplacementRows([
                createWarrantyReplacementRow(defaultItem.variant_id || validVariants[0]?.id || "", 1),
            ]);
            setWarrantyProductSearch("");
            setWarrantyReturnBucket("defective");
            setWarrantyReason("");
            setWarrantyNotes("");
            setWarrantySettlementAccountId("");
            setWarrantySettlementMethodId("");
            setWarrantySettlementInstallments("");
            setWarrantySettlementMode("none");
            setWarrantyManualAmountArs("");
            setWarrantyOpen(true);
        } catch (error) {
            toast.error("No se pudo preparar el flujo de garantia", {
                description: error?.message,
            });
        }
    };

    const handleProcessWarranty = async () => {
        if (!warrantySale) return;
        if (!selectedWarrantyItemId) {
            toast.error("Selecciona el item original");
            return;
        }
        if (!warrantyReason.trim()) {
            toast.error("Debes ingresar el motivo de la garantia");
            return;
        }

        const selectedItem = warrantyItems.find(
            (item) =>
                String(item.warranty_selection_id || item.id) ===
                String(selectedWarrantyItemId),
        );
        const validReplacementRows = warrantyReplacementRows.filter(
            (row) => row.variant_id && Number(row.quantity || 0) > 0,
        );

        if (validReplacementRows.length === 0) {
            toast.error("Debes agregar al menos un producto de reemplazo");
            return;
        }

        const resolvedReplacementRows = [];
        for (const row of validReplacementRows) {
            const replacementVariant = replacementOptions.find(
                (variant) => String(variant.id) === String(row.variant_id),
            );

            if (!replacementVariant) {
                toast.error("Selecciona un producto de reemplazo válido");
                return;
            }

            if (isSerialTrackedVariant(replacementVariant)) {
                if (Number(row.quantity || 0) !== 1) {
                    toast.error("Los reemplazos serializados deben tener cantidad 1");
                    return;
                }

                const normalizedIdentifier = normalizeIdentifier(row.imei);
                if (!normalizedIdentifier) {
                    toast.error("Debes indicar el IMEI/SN de la unidad de reemplazo");
                    return;
                }

                const { data: inventoryUnits, error: inventoryError } = await supabase
                    .from("inventory_units")
                    .select("id, identifier_value")
                    .eq("variant_id", Number(row.variant_id))
                    .eq("identifier_normalized", normalizedIdentifier)
                    .eq("status", "available")
                    .limit(1);

                if (inventoryError) {
                    throw inventoryError;
                }

                const inventoryUnit = inventoryUnits?.[0];
                if (!inventoryUnit) {
                    toast.error("No se encontró una unidad disponible para el reemplazo indicado");
                    return;
                }

                resolvedReplacementRows.push({
                    ...row,
                    quantity: 1,
                    imei: inventoryUnit.identifier_value,
                    inventory_unit_id: inventoryUnit.id,
                });
                continue;
            }

            resolvedReplacementRows.push({
                ...row,
                inventory_unit_id: null,
                imei: row.imei?.trim() || null,
            });
        }

        if (Math.abs(warrantyPriceDiff.differenceUsd) > 0.009) {
            if (warrantySettlementMode === "none") {
                // Direct exchange: no further validation needed
            } else if (warrantySettlementMode === "store_credit") {
                // Store credit: will create pending sale with payout
            } else if (warrantySettlementMode === "customer_payment") {
                // Customer pays: will create pending sale with collection
            }
        }

        const manualAmount = warrantyManualAmountArs
            ? Number(warrantyManualAmountArs)
            : null;

        try {
            setWarrantyProcessing(true);
            const { error } = await supabase.rpc("process_warranty_exchange", {
                p_sale_id: warrantySale.sale_id,
                p_sale_item_id: Number(selectedItem?.sale_item_id || selectedItem?.id),
                p_original_inventory_unit_id: selectedItem?.inventory_unit_id || null,
                p_return_bucket: warrantyReturnBucket,
                p_replacements: resolvedReplacementRows.map((row) => ({
                    variant_id: Number(row.variant_id),
                    quantity: Number(row.quantity || 0),
                    imei: row.imei?.trim() || null,
                    inventory_unit_id: row.inventory_unit_id || null,
                })),
                p_reason: warrantyReason.trim(),
                p_notes: warrantyNotes.trim() || null,
                p_settlement_account_id: null,
                p_settlement_payment_method_id: null,
                p_settlement_installments: null,
                p_settlement_multiplier: null,
                p_settlement_currency: null,
                p_settlement_amount: null,
                p_settlement_amount_ars: null,
                p_settlement_fx_rate_used: fxRate || null,
                p_settlement_mode: warrantySettlementMode,
                p_manual_amount_ars: manualAmount,
            });

            if (error) throw error;

            toast.success("Garantia procesada correctamente");
            closeWarrantyDialog();
            load();
        } catch (error) {
            toast.error("No se pudo procesar la garantia", {
                description: error?.message,
            });
        } finally {
            setWarrantyProcessing(false);
        }
    };


    // 📄 Generar PDF de venta
    const handleDownloadSalePDF = (sale) => {
        generateSalePDF(sale, warrantiesBySale);
    };

    return (
        <div className="pb-6 space-y-6">

            {/* 🔎 FILTROS EXACTO AL ESTILO FxRatesConfig */}
            <div
                className="flex flex-col gap-3 sm:flex-row lg:items-center sm:justify-between"
            >
                {/* ------- FILA 1 (siempre) ------- */}
                <div className="flex gap-3">
                    {/* Rango (ocupa espacio restante en mobile) */}
                    <div className="flex-1">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="flex items-center gap-2 w-full sm:w-auto"
                                >
                                    <IconCalendar className="h-4 w-4" />
                                    {dateRange?.from
                                        ? `${dateRange.from.toLocaleDateString("es-AR")} → ${dateRange.to
                                            ? dateRange.to.toLocaleDateString("es-AR")
                                            : "..."
                                        }`
                                        : "Seleccionar rango"}
                                </Button>
                            </PopoverTrigger>

                            <PopoverContent className="p-2" align="start">
                                <Calendar
                                    mode="range"
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    className="rounded-lg border shadow-sm"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Semana actual */}
                    <Button
                        variant="outline"
                        onClick={() => setDateRange(getDefaultWeekRange())}
                        className="whitespace-nowrap"
                    >
                        Semana actual
                    </Button>

                    {/* Filtro por estado */}
                    <Select
                        value={filters.status || "all"}
                        onValueChange={(val) =>
                            setFilters((f) => ({ ...f, status: val === "all" ? "" : val }))
                        }
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="vendido">Vendido</SelectItem>
                            <SelectItem value="pending">Pendiente</SelectItem>
                            <SelectItem value="anulado">Anulado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* ------- FILA 2 SOLO EN MOBILE, MISMA FILA EN LG+ ------- */}
                <div
                    className="flex w-full justify-end gap-3 lg:w-auto lg:justify-end"
                >
                    <Button
                        variant="outline"
                        onClick={() => {
                            setDateRange(getDefaultMonthRange());
                            load();
                        }}
                        disabled={refreshing}
                    >
                        <IconRefresh
                            className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                        />
                        Refrescar
                    </Button>
                </div>
            </div>


            {/* Filtro por vendedor */}
            {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-muted p-4 rounded-lg">
        <div>
          <label className="text-sm font-medium">Vendedor:</label>
          <Input
            placeholder="ID vendedor (provisorio)"
            onChange={(e) =>
              setFilters((f) => ({ ...f, seller_id: e.target.value }))
            }
          />
        </div>
      </div> */}

            {/* 🧾 LISTA DE TICKETS */}
            <div className="space-y-6">
                {sales.length !== 0 ? sales.map((s) => {
                    const updatedFields = normalizeUpdatedFields(s.updated_fields);
                    const saleWarranties = warrantiesBySale[s.sale_id] || [];
                    return (
                    <Card key={s.sale_id} className={`p-5 shadow-md w-full ${
                        s.status === "pending"
                            ? "border-l-4 border-l-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/10 opacity-75"
                            : s.status === "anulado"
                                ? "border-l-4 border-l-red-400 bg-red-50/50 dark:bg-red-950/10 opacity-60"
                                : s.status === "cancelado"
                                    ? "border-l-4 border-l-orange-400 bg-orange-50/50 dark:bg-orange-950/10 opacity-70"
                                    : ""
                    }`}>
                        <div className="flex justify-between">
                            <h2 className="font-bold text-lg">
                                {s.sale_type === "canje" ? "Canje" : "Venta"} #{s.sale_id}
                            </h2>
                            <span className="text-sm text-muted-foreground">
                                {new Date(s.sale_date).toLocaleString("es-AR", {
                                    timeZone: AR_TIMEZONE,
                                    hour12: false,
                                })}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {s.sale_type === "canje" && (
                                <Badge className="bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800">
                                    CANJE
                                </Badge>
                            )}
                            {s.status && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        Estado:
                                    </span>
                                    <Badge
                                        variant={
                                            s.status === "anulado" ? "destructive" : "default"
                                        }
                                        className={
                                            s.status === "pending" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400"
                                            : s.status === "cancelado" ? "bg-orange-100 text-orange-800 dark:bg-orange-950/20 dark:text-orange-400"
                                            : ""
                                        }
                                    >
                                        {s.status === "anulado" ? "ANULADA" : s.status === "pending" ? "PENDIENTE" : s.status === "cancelado" ? "CANCELADA" : s.status.toUpperCase()}
                                    </Badge>
                                </div>
                            )}
                            {s.sales_channel_name && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        Origen:
                                    </span>
                                    <Badge variant="outline">
                                        {s.sales_channel_name}
                                    </Badge>
                                </div>
                            )}
                        </div>

                        {s.status === "pending" && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 font-medium">
                                Esta venta no fue concretada. Solo puede cancelarse.
                            </p>
                        )}

                        <hr className="my-3" />

                        {/* Cliente y vendedor */}
                        <div className="text-sm mb-3">
                            <p>
                                <strong>Cliente:</strong>{" "}
                                {formatPersonName(s.customer_name, s.customer_last_name)}
                                <strong>{" | "}Tel:</strong> {" "} {s.customer_phone ?? "-"}
                            </p>
                            <p>
                                <strong>Vendedor:</strong>{" "}
                                {formatPersonName(s.seller_name, s.seller_last_name)}
                                <strong>{" | "}Tel:</strong> {" "} {s.seller_phone ?? "3816783617"}
                            </p>
                        </div>

                        {/* Items */}
                        <div className="text-sm border rounded p-3 bg-muted/40">
                            <strong>Productos:</strong>
                            {s.items?.map((i, idx) => (
                                <div key={idx} className="border-b py-1 last:border-0">
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-2">
                                            {i.product_name} {i.variant_name} {i.color ? `(${i.color})` : ""} — {i.quantity}u
                                            {i.is_gift && (
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                                                    REGALO
                                                </Badge>
                                            )}
                                        </span>
                                        <span>
                                            {i.is_gift ? "$0" : `$${Number(i.subtotal_ars ?? 0).toLocaleString("es-AR")}`}
                                        </span>
                                    </div>
                                    {i.imeis && i.imeis.length > 0 && (
                                        <div className="text-xs text-muted-foreground">
                                            {i.imeis.length === 1 
                                                ? `IMEI: ${i.imeis[0]}`
                                                : `IMEIs: ${i.imeis.join(", ")}`
                                            }
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Pagos (solo si no está pendiente) */}
                        {s.status !== "pending" && (
                        <div className="text-sm border rounded p-3 mt-3 bg-muted/40">
                            <strong>Métodos de pago:</strong>
                            {s.sale_type === "canje" && s.trade_in_data && (() => {
                                const items = getReceivedItems(s.trade_in_data);
                                const total = getTotalReceivedArs(s.trade_in_data);
                                return (
                                    <div className="flex justify-between border-b py-1 text-green-600">
                                        <span>Crédito canje ({items.length === 1 ? `${items[0].product_name} ${items[0].variant_name}` : `${items.length} producto${items.length > 1 ? "s" : ""}`})</span>
                                        <span>-${total.toLocaleString("es-AR")}</span>
                                    </div>
                                );
                            })()}
                            {s.payments?.map((p, idx) => (
                                <div key={idx} className="flex justify-between border-b last:border-0 py-1">
                                    <span>
                                        {p.payment_method_name}
                                        {p.installments > 1 ? ` · ${p.installments} cuotas` : ""}
                                    </span>
                                    <span>${Number(p.amount_ars).toLocaleString("es-AR")}</span>
                                </div>
                            ))}
                        </div>
                        )}

                        {s.notes && (
                            <div className="text-sm border rounded p-3 mt-3 bg-muted/40">
                                <strong>Notas: </strong>
                                {s.notes}
                            </div>
                        )}

                        {(s.updated_by || updatedFields) && (
                            <div className="text-xs border-l-2 border-blue-500 rounded p-3 mt-3 bg-blue-50 dark:bg-blue-950/20">
                                <div className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                                    🧾 Información de modificación
                                </div>
                                <div className="space-y-1 text-blue-700 dark:text-blue-300">
                                    <p>
                                        <strong>Modificado el:</strong>{" "}
                                        {s.updated_at
                                            ? new Date(s.updated_at).toLocaleString("es-AR", {
                                                timeZone: AR_TIMEZONE,
                                                hour12: false,
                                            })
                                            : "-"}
                                    </p>
                                    <p>
                                        <strong>Modificado por:</strong>{" "}
                                        {getAuditUserLabel(s.updated_by)}
                                    </p>
                                    {updatedFields &&
                                        Object.keys(updatedFields).length > 0 && (
                                            <div className="pt-1">
                                                <strong>Cambios:</strong>
                                                <ul className="mt-1 space-y-1">
                                                    {Object.entries(updatedFields).map(
                                                        ([fieldKey, payload]) => (
                                                            <li key={fieldKey}>
                                                                {renderUpdatedField(
                                                                    fieldKey,
                                                                    payload
                                                                )}
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            </div>
                                        )}
                                </div>
                            </div>
                        )}

                        {s.status === "anulado" && (
                            <div className="text-xs border-l-2 border-red-500 rounded p-3 mt-3 bg-red-50 dark:bg-red-950/20">
                                <div className="font-semibold text-red-700 dark:text-red-300 mb-2">
                                    📋 Información de Anulación
                                </div>
                                <div className="space-y-1 text-red-700 dark:text-red-300">
                                    <p>
                                        <strong>Motivo:</strong> {s.void_reason || "-"}
                                    </p>
                                    <p>
                                        <strong>Anulado el:</strong>{" "}
                                        {s.voided_at
                                            ? new Date(s.voided_at).toLocaleString("es-AR", {
                                                timeZone: AR_TIMEZONE,
                                                hour12: false,
                                            })
                                            : "-"}
                                    </p>
                                    <p>
                                        <strong>Anulado por:</strong>{" "}
                                        {getAuditUserLabel(s.voided_by)}
                                    </p>
                                    <p>
                                        <strong>Stock devuelto a:</strong>{" "}
                                        {s.void_stock_bucket === "available"
                                            ? "Disponible"
                                            : s.void_stock_bucket === "defective"
                                                ? "Defectuoso"
                                                : "-"}
                                    </p>
                                </div>
                            </div>
                        )}

                        {saleWarranties.length > 0 && (
                            <div className="text-xs border-l-2 border-amber-500 rounded p-3 mt-3 bg-amber-50 dark:bg-amber-950/20">
                                <div className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                                    Historial de garantia
                                </div>
                                <div className="space-y-3 text-amber-700 dark:text-amber-300">
                                    {saleWarranties.map((warranty) => (
                                        <div key={warranty.id} className="rounded-md border border-amber-200/60 dark:border-amber-900/60 p-3">
                                            <p>
                                                <strong>Fecha:</strong>{" "}
                                                {warranty.created_at
                                                    ? new Date(warranty.created_at).toLocaleString("es-AR", {
                                                          timeZone: AR_TIMEZONE,
                                                          hour12: false,
                                                      })
                                                    : "-"}
                                            </p>
                                            <p>
                                                <strong>Motivo:</strong> {warranty.reason || "-"}
                                            </p>
                                            <p>
                                                <strong>Equipo devuelto:</strong>{" "}
                                                {formatVariantLabel({
                                                    product_name:
                                                        warranty.original_variant?.products?.name,
                                                    variant_name:
                                                        warranty.original_variant?.variant_name,
                                                    color: warranty.original_variant?.color,
                                                })}
                                                {warranty.original_imei
                                                    ? ` | IMEI: ${warranty.original_imei}`
                                                    : ""}
                                            </p>
                                            <p>
                                                <strong>Reemplazo:</strong>{" "}
                                                {(warranty.replacement_items?.length
                                                    ? warranty.replacement_items
                                                    : [
                                                          {
                                                              variant: warranty.replacement_variant,
                                                              imei: warranty.replacement_imei,
                                                              quantity: warranty.quantity,
                                                          },
                                                      ]
                                                )
                                                    .map((replacement) => {
                                                        const label = formatVariantLabel({
                                                            product_name:
                                                                replacement.variant?.products?.name,
                                                            variant_name:
                                                                replacement.variant?.variant_name,
                                                            color: replacement.variant?.color,
                                                        });
                                                        return `${label}${
                                                            replacement.imei
                                                                ? ` | IMEI: ${replacement.imei}`
                                                                : ""
                                                        }${
                                                            Number(replacement.quantity || 1) > 1
                                                                ? ` | Cant: ${replacement.quantity}`
                                                                : ""
                                                        }`;
                                                    })
                                                    .join(" / ")}
                                            </p>
                                            <p>
                                                <strong>Ingreso del devuelto a:</strong>{" "}
                                                {formatWarrantyBucket(warranty.returned_stock_bucket)}
                                            </p>
                                            {Math.abs(Number(warranty.price_difference_usd || 0)) > 0.009 && (
                                                <p>
                                                    <strong>
                                                        {warranty.settlement_type === "store_credit"
                                                            ? "Saldo a favor:"
                                                            : warranty.settlement_type === "customer_payment"
                                                                ? "Diferencia cobrada:"
                                                                : "Diferencia:"}
                                                    </strong>{" "}
                                                    {warranty.settlement_currency || "USD"}{" "}
                                                    {Number(warranty.settlement_amount || warranty.store_credit_usd || Math.abs(warranty.price_difference_usd || 0)).toLocaleString(
                                                        "es-AR",
                                                        {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        },
                                                    )}{" "}
                                                    ({Number(warranty.price_difference_usd || 0).toFixed(2)} USD)
                                                    {warranty.settlement_type === "none" && (
                                                        <span className="text-xs text-muted-foreground"> — Cambio directo</span>
                                                    )}
                                                </p>
                                            )}
                                            {warranty.settlement_type === "none" && Math.abs(Number(warranty.price_difference_usd || 0)) > 0.009 && warranty.price_difference_usd < 0 && (
                                                <p className="text-xs text-sky-700 dark:text-sky-300">
                                                    COGS de venta original ajustado
                                                </p>
                                            )}
                                            {warranty.warranty_sale_id && (
                                                <p>
                                                    <strong>Venta pendiente:</strong> #{warranty.warranty_sale_id}
                                                </p>
                                            )}
                                            {warranty.settlement_method?.name && (
                                                <p>
                                                    <strong>Metodo:</strong> {warranty.settlement_method.name}
                                                    {warranty.settlement_installments
                                                        ? ` | ${warranty.settlement_installments} cuotas`
                                                        : ""}
                                                    {Number(warranty.settlement_multiplier || 1) > 1
                                                        ? ` | x${Number(warranty.settlement_multiplier).toFixed(2)}`
                                                        : ""}
                                                </p>
                                            )}
                                            {warranty.notes && (
                                                <p>
                                                    <strong>Notas:</strong> {warranty.notes}
                                                </p>
                                            )}
                                            {Number(warranty.store_credit_usd || 0) > 0.009 && (
                                                <p>
                                                    <strong>Credito proxima compra:</strong> USD{" "}
                                                    {Number(warranty.store_credit_usd || 0).toLocaleString(
                                                        "es-AR",
                                                        {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        },
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="text-right mt-3 space-y-1">
                            <div className="text-sm text-muted-foreground">
                                Subtotal: $
                                {(Number(s.total_ars) + Number(s.discount_amount || 0)).toLocaleString("es-AR")}
                            </div>

                            {Number(s.discount_amount) > 0 && (
                                <div className="text-sm text-green-600">
                                    Descuento: −$
                                    {Number(s.discount_amount).toLocaleString("es-AR")}
                                </div>
                            )}

                            <div className="font-bold text-xl text-primary">
                                Total a pagar: $
                                {Number(s.total_ars).toLocaleString("es-AR")}
                            </div>
                        </div>


                        {/* Botón descargar PDF */}
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            {(isOwner || canManageSaleActions) && (
                                <> 
                                    {isOwner && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditSale(s)}
                                        disabled={s.status === "anulado" || s.status === "pending"}
                                    >
                                        Editar venta
                                    </Button>
                                    )}
                                    {canManageSaleActions && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => openWarrantyDialog(s)}
                                        disabled={s.status === "anulado" || s.status === "pending"}
                                    >
                                        <IconShieldCheck className="mr-2 h-4 w-4" />
                                        Garantia
                                    </Button>
                                    )}
                                    {canManageSaleActions && s.status === "pending" && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => startConfirmCancelSale(s)}
                                    >
                                        Cancelar venta
                                    </Button>
                                    )}
                                    {canManageSaleActions && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => startCancelSale(s)}
                                        disabled={s.status === "anulado" || s.status === "pending"}
                                    >
                                        Anular venta
                                    </Button>
                                    )}
                                </>
                            )}
                            <Button
                                onClick={() => handleDownloadSalePDF(s)}
                                size="sm"
                                className="gap-2"
                                disabled={s.status === "pending"}
                            >
                                <IconDownload className="h-4 w-4" />
                                Descargar PDF
                            </Button>
                        </div>
                    </Card>
                    );
                }) :
                    (
                        <p className="text-center text-muted-foreground">No se encontraron ventas para los filtros seleccionados.</p>
                    )}
            </div>

            <Dialog
                open={editOpen}
                onOpenChange={(open) => {
                    if (!open) closeEditSale();
                }}
            >
                <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>Editar venta</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Fecha de venta</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start text-left"
                                    >
                                        {editDate
                                            ? editDate.toLocaleDateString("es-AR")
                                            : "Seleccionar fecha"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="p-0">
                                    <Calendar
                                        mode="single"
                                        selected={editDate}
                                        onSelect={setEditDate}
                                        className="m-auto"
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Hora</Label>
                            <Input
                                type="time"
                                value={editTime}
                                onChange={(e) => setEditTime(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Vendedor</Label>
                            <Select
                                value={editSellerId || ""}
                                onValueChange={setEditSellerId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar vendedor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {editingSale?.seller_id &&
                                        !sellerOptions.some(
                                            (seller) =>
                                                seller.id_auth === editingSale.seller_id
                                        ) && (
                                            <SelectItem value={editingSale.seller_id}>
                                                {[editingSale.seller_name, editingSale.seller_last_name]
                                                    .filter(Boolean)
                                                    .join(" ") || "Vendedor actual"}
                                            </SelectItem>
                                        )}
                                    {sellerOptions.length === 0 ? (
                                        <SelectItem value="none" disabled>
                                            Sin vendedores activos
                                        </SelectItem>
                                    ) : (
                                        sellerOptions.map((seller) => (
                                            <SelectItem
                                                key={seller.id_auth}
                                                value={seller.id_auth}
                                            >
                                                {[seller.name, seller.last_name]
                                                    .filter(Boolean)
                                                    .join(" ") || seller.email}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Canal de venta</Label>
                            <Select
                                value={editChannelId || ""}
                                onValueChange={setEditChannelId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar canal" />
                                </SelectTrigger>
                                <SelectContent>
                                    {editingSale?.sales_channel_id &&
                                        !channels.some(
                                            (ch) =>
                                                ch.id === editingSale.sales_channel_id
                                        ) && (
                                            <SelectItem value={String(editingSale.sales_channel_id)}>
                                                {editingSale.sales_channel_name || "Canal actual"}
                                            </SelectItem>
                                        )}
                                    {channels.length === 0 ? (
                                        <SelectItem value="none" disabled>
                                            Sin canales activos
                                        </SelectItem>
                                    ) : (
                                        channels.map((channel) => (
                                            <SelectItem
                                                key={channel.id}
                                                value={channel.id.toString()}
                                            >
                                                {channel.name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeEditSale}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={savingEdit}>
                            {savingEdit ? "Guardando..." : "Guardar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={warrantyOpen}
                onOpenChange={(open) => {
                    if (!open) closeWarrantyDialog();
                }}
            >
                <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>
                            Gestionar garantia {warrantySale ? `#${warrantySale.sale_id}` : ""}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-md border bg-muted/30 p-3 text-sm">
                            <p>
                                <strong>Cliente:</strong>{" "}
                                {warrantySale
                                    ? formatPersonName(
                                          warrantySale.customer_name,
                                          warrantySale.customer_last_name,
                                      )
                                    : "-"}
                            </p>
                            <p>
                                <strong>Fecha original:</strong>{" "}
                                {warrantySale?.sale_date
                                    ? new Date(warrantySale.sale_date).toLocaleString("es-AR", {
                                          timeZone: AR_TIMEZONE,
                                          hour12: false,
                                      })
                                    : "-"}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Equipo original</Label>
                            <Select
                                value={selectedWarrantyItemId}
                                onValueChange={(value) => {
                                    setSelectedWarrantyItemId(value);
                                    const nextItem = warrantyItems.find(
                                        (item) =>
                                            String(item.warranty_selection_id || item.id) ===
                                            String(value),
                                    );
                                    const nextReplacement =
                                        replacementOptions.find(
                                            (variant) => variant.id === nextItem?.variant_id,
                                        ) || replacementOptions[0];
                                    setWarrantyReplacementRows([
                                        createWarrantyReplacementRow(
                                            nextReplacement?.id || "",
                                            1,
                                        ),
                                    ]);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar item vendido" />
                                </SelectTrigger>
                                    <SelectContent>
                                        {warrantyItems.map((item) => (
                                        <SelectItem
                                            key={item.warranty_selection_id || item.id}
                                            value={String(item.warranty_selection_id || item.id)}
                                        >
                                            {formatVariantLabel(item)}
                                            {item.imei ? ` | IMEI: ${item.imei}` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Destino del equipo devuelto</Label>
                            <Select
                                value={warrantyReturnBucket}
                                onValueChange={setWarrantyReturnBucket}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar destino" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="available">Disponible</SelectItem>
                                    <SelectItem value="defective">Defectuoso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label>Buscar producto de reemplazo</Label>
                                <Input
                                    placeholder="Buscar por producto, variante o color"
                                    value={warrantyProductSearch}
                                    onChange={(e) => setWarrantyProductSearch(e.target.value)}
                                />
                            </div>

                            <div className="space-y-3">
                                {replacementRowsDetailed.map((row, index) => (
                                    <div
                                        key={row.id}
                                        className="rounded-md border p-3 space-y-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <Label>Producto #{index + 1}</Label>
                                            {replacementRowsDetailed.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeWarrantyReplacementRow(row.id)}
                                                >
                                                    Quitar
                                                </Button>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Producto de reemplazo</Label>
                                            <Select
                                                value={row.variant_id}
                                                onValueChange={(value) => {
                                                    const selectedVariant = replacementOptions.find(
                                                        (variant) => String(variant.id) === String(value),
                                                    );
                                                    updateWarrantyReplacementRow(row.id, {
                                                        variant_id: value,
                                                        quantity: isSerialTrackedVariant(selectedVariant)
                                                            ? "1"
                                                            : row.quantity,
                                                        imei: "",
                                                        inventory_unit_id: null,
                                                    });
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccionar reemplazo" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {filteredReplacementOptions.map((variant) => (
                                                        <SelectItem
                                                            key={variant.id}
                                                            value={String(variant.id)}
                                                        >
                                                            {formatVariantLabel({
                                                                product_name: variant.products?.name,
                                                                variant_name: variant.variant_name,
                                                                color: variant.color,
                                                            })}{" "}
                                                            | Stock: {variant.stock}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Cantidad</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={row.quantity}
                                                    disabled={isSerialTrackedVariant(row.variant)}
                                                    onChange={(e) =>
                                                        updateWarrantyReplacementRow(row.id, {
                                                            quantity: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>
                                                    {isSerialTrackedVariant(row.variant)
                                                        ? "IMEI/SN de reemplazo"
                                                        : "IMEI nuevo"}
                                                </Label>
                                                <Input
                                                    placeholder={
                                                        isSerialTrackedVariant(row.variant)
                                                            ? "Obligatorio para serializados"
                                                            : "Opcional"
                                                    }
                                                    value={row.imei}
                                                    onChange={(e) =>
                                                        updateWarrantyReplacementRow(row.id, {
                                                            imei: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>

                                        <p className="text-xs text-muted-foreground">
                                            Subtotal: USD{" "}
                                            {Number(row.subtotalUsd || 0).toLocaleString("es-AR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => addWarrantyReplacementRow("", 1)}
                            >
                                Agregar producto
                            </Button>
                        </div>

                        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                            <p>
                                <strong>Valor original:</strong> USD{" "}
                                {Number(warrantyPriceDiff.originalTotalUsd || 0).toLocaleString(
                                    "es-AR",
                                    {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    },
                                )}
                            </p>
                            <p>
                                <strong>Valor reemplazo:</strong> USD{" "}
                                {Number(warrantyPriceDiff.replacementTotalUsd || 0).toLocaleString(
                                    "es-AR",
                                    {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    },
                                )}
                            </p>
                            <p
                                className={
                                    warrantyPriceDiff.differenceUsd > 0
                                        ? "text-amber-700 dark:text-amber-300"
                                        : warrantyPriceDiff.differenceUsd < 0
                                            ? "text-sky-700 dark:text-sky-300"
                                            : "text-muted-foreground"
                                }
                            >
                                <strong>Diferencia:</strong>{" "}
                                USD{" "}
                                {Math.abs(
                                    Number(warrantyPriceDiff.differenceUsd || 0),
                                ).toLocaleString("es-AR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                                {fxRate && Math.abs(warrantyPriceDiff.differenceUsd) > 0.009 && (
                                    <span className="text-xs">
                                        {" "}(${Math.abs(warrantyPriceDiff.differenceArs || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS)
                                    </span>
                                )}
                            </p>
                        </div>

                        {Math.abs(warrantyPriceDiff.differenceUsd) > 0.009 && (
                            <div className="space-y-3">
                                <Label>Tipo de liquidacion</Label>
                                <div className="space-y-2">
                                    <label
                                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                                            warrantySettlementMode === "none"
                                                ? "border-primary bg-primary/5"
                                                : "hover:bg-muted"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="settlement_mode"
                                            value="none"
                                            checked={warrantySettlementMode === "none"}
                                            onChange={() => setWarrantySettlementMode("none")}
                                            className="mt-0.5 h-4 w-4"
                                        />
                                        <div>
                                            <div className="font-semibold text-sm">Cambio directo</div>
                                            <div className="text-xs text-muted-foreground">
                                                Sin movimiento de caja. La empresa{" "}
                                                {warrantyPriceDiff.differenceUsd < 0 ? "absorbe la ganancia" : "absorbe la perdida"}.
                                            </div>
                                        </div>
                                    </label>

                                    {warrantyPriceDiff.differenceUsd < -0.009 && (
                                        <label
                                            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                                                warrantySettlementMode === "store_credit"
                                                    ? "border-primary bg-primary/5"
                                                    : "hover:bg-muted"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="settlement_mode"
                                                value="store_credit"
                                                checked={warrantySettlementMode === "store_credit"}
                                                onChange={() => setWarrantySettlementMode("store_credit")}
                                                className="mt-0.5 h-4 w-4"
                                            />
                                            <div>
                                                <div className="font-semibold text-sm">Saldo a favor del cliente</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Se crea venta pendiente. El cliente cobra desde caja.
                                                </div>
                                            </div>
                                        </label>
                                    )}

                                    {warrantyPriceDiff.differenceUsd > 0.009 && (
                                        <label
                                            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                                                warrantySettlementMode === "customer_payment"
                                                    ? "border-primary bg-primary/5"
                                                    : "hover:bg-muted"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="settlement_mode"
                                                value="customer_payment"
                                                checked={warrantySettlementMode === "customer_payment"}
                                                onChange={() => setWarrantySettlementMode("customer_payment")}
                                                className="mt-0.5 h-4 w-4"
                                            />
                                            <div>
                                                <div className="font-semibold text-sm">Cobrar diferencia</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Se crea venta pendiente. El cliente paga desde caja.
                                                </div>
                                            </div>
                                        </label>
                                    )}
                                </div>
                            </div>
                        )}

                        {warrantySettlementMode === "none" && Math.abs(warrantyPriceDiff.differenceUsd) > 0.009 && (
                            <div className="rounded-md border border-dashed p-3 text-sm">
                                {warrantyPriceDiff.differenceUsd < -0.009 ? (
                                    <p className="text-sky-700 dark:text-sky-300">
                                        <strong>Cambio directo:</strong> El producto de reemplazo tiene un precio de venta ${Math.abs(warrantyPriceDiff.differenceUsd).toFixed(2)} USD menor. El costo (COGS) de la venta original se actualizará al costo del producto entregado.
                                    </p>
                                ) : (
                                    <p className="text-amber-700 dark:text-amber-300">
                                        <strong>Cambio directo:</strong> El producto de reemplazo tiene un precio de venta ${warrantyPriceDiff.differenceUsd.toFixed(2)} USD mayor. La empresa absorbe la diferencia.
                                    </p>
                                )}
                            </div>
                        )}

                        {warrantySettlementMode === "store_credit" && (
                            <div className="space-y-3 rounded-md border border-dashed border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
                                <p className="text-sm text-sky-800 dark:text-sky-200">
                                    <strong>Saldo a favor del cliente:</strong> se creará una venta pendiente de tipo "Garantía" que el cliente podrá cobrar desde caja.
                                </p>
                                <div className="space-y-2">
                                    <Label>Monto a acreditar (ARS)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder={warrantyPriceDiff.differenceArs
                                            ? String(Math.abs(warrantyPriceDiff.differenceArs))
                                            : "0"
                                        }
                                        value={warrantyManualAmountArs}
                                        onChange={(e) => setWarrantyManualAmountArs(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Calculado: ${Math.abs(warrantyPriceDiff.differenceArs || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
                                        {fxRate && ` (USD ${Math.abs(warrantyPriceDiff.differenceUsd).toFixed(2)} × $${Number(fxRate).toLocaleString("es-AR")})`}
                                    </p>
                                </div>
                            </div>
                        )}

                        {warrantySettlementMode === "customer_payment" && (
                            <div className="space-y-3 rounded-md border border-dashed border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    <strong>Cobro de diferencia:</strong> se creará una venta pendiente de tipo "Garantía" que se cobrará desde caja.
                                </p>
                                <div className="space-y-2">
                                    <Label>Monto a cobrar (ARS)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder={warrantyPriceDiff.differenceArs
                                            ? String(Math.abs(warrantyPriceDiff.differenceArs))
                                            : "0"
                                        }
                                        value={warrantyManualAmountArs}
                                        onChange={(e) => setWarrantyManualAmountArs(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Calculado: ${Math.abs(warrantyPriceDiff.differenceArs || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
                                        {fxRate && ` (USD ${Math.abs(warrantyPriceDiff.differenceUsd).toFixed(2)} × $${Number(fxRate).toLocaleString("es-AR")})`}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Motivo de garantia</Label>
                            <Textarea
                                placeholder="Ej: falla de pantalla, problema de bateria..."
                                value={warrantyReason}
                                onChange={(e) => setWarrantyReason(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Notas internas</Label>
                            <Textarea
                                placeholder="Observaciones adicionales"
                                value={warrantyNotes}
                                onChange={(e) => setWarrantyNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeWarrantyDialog}>
                            Cancelar
                        </Button>
                        <Button onClick={handleProcessWarranty} disabled={warrantyProcessing}>
                            {warrantyProcessing ? "Procesando..." : "Guardar garantia"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 🗑️ Dialog para ingresar motivo de anulación */}
            <Dialog open={cancelOpen} onOpenChange={(open) => {
                if (!open) closeCancelDialog();
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Anular venta #{cancelingSale?.sale_id}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="cancel-reason">Motivo de anulación</Label>
                            <Input
                                id="cancel-reason"
                                placeholder="Ej: Error de carga, cliente cambió de idea..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="min-h-20 resize-none"
                                as="textarea"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeCancelDialog}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={proceedToBucketSelection}
                        >
                            Siguiente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 🪣 Dialog para seleccionar bucket de stock */}
            <Dialog open={bucketOpen} onOpenChange={(open) => {
                if (!open) closeBucketDialog();
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Destino del stock devuelto</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            ¿Dónde debe devolverse el stock de esta venta anulada?
                        </p>

                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted transition"
                                onClick={() => setSelectedBucket("available")}
                            >
                                <input
                                    type="radio"
                                    name="bucket"
                                    value="available"
                                    checked={selectedBucket === "available"}
                                    onChange={() => setSelectedBucket("available")}
                                    className="h-4 w-4"
                                />
                                <div>
                                    <div className="font-semibold">Stock Disponible</div>
                                    <div className="text-sm text-muted-foreground">
                                        El producto puede venderse nuevamente
                                    </div>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted transition"
                                onClick={() => setSelectedBucket("defective")}
                            >
                                <input
                                    type="radio"
                                    name="bucket"
                                    value="defective"
                                    checked={selectedBucket === "defective"}
                                    onChange={() => setSelectedBucket("defective")}
                                    className="h-4 w-4"
                                />
                                <div>
                                    <div className="font-semibold">Stock Defectuoso</div>
                                    <div className="text-sm text-muted-foreground">
                                        El producto necesita revisión/reparación
                                    </div>
                                </div>
                            </label>
                        </div>

                        {canjeReceivedUnits.length > 0 && (
                            <div className="space-y-2 p-3 border rounded-lg bg-purple-50 dark:bg-purple-950/30">
                                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                    Unidad recibida por canje
                                </p>
                                {canjeReceivedUnits.map((unit) => (
                                    <p key={unit.id} className="text-sm text-muted-foreground">
                                        {unit.identifier_value || `Unidad #${unit.id}`}
                                    </p>
                                ))}
                                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                    <Checkbox
                                        checked={deleteCanjeUnit}
                                        onCheckedChange={(v) => setDeleteCanjeUnit(!!v)}
                                    />
                                    <span className="text-sm">Eliminar unidad ingresada por canje</span>
                                </label>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeBucketDialog}>
                            Atrás
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={completeCancelSale}
                            disabled={cancelingProcess}
                        >
                            {cancelingProcess ? "Anulando..." : "Confirmar anulación"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog confirmar cancelar venta */}
            <Dialog open={confirmCancelOpen} onOpenChange={(open) => {
                if (!open) closeConfirmCancelDialog();
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Cancelar venta</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Esta acción cancelará la venta y devolverá el stock al inventario. No se revierte dinero (la venta no fue cobrada).
                        </p>
                        {confirmCancelSale && (
                            <p className="text-sm">
                                Venta <strong>#{confirmCancelSale.sale_id}</strong> de{" "}
                                <strong>{formatPersonName(confirmCancelSale.customer_name, confirmCancelSale.customer_last_name)}</strong>
                            </p>
                        )}
                        {canjeReceivedUnits.length > 0 && (
                            <div className="space-y-2 p-3 border rounded-lg bg-purple-50 dark:bg-purple-950/30">
                                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                    Unidad recibida por canje
                                </p>
                                {canjeReceivedUnits.map((unit) => (
                                    <p key={unit.id} className="text-sm text-muted-foreground">
                                        {unit.identifier_value || `Unidad #${unit.id}`}
                                    </p>
                                ))}
                                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                    <Checkbox
                                        checked={deleteCanjeUnit}
                                        onCheckedChange={(v) => setDeleteCanjeUnit(!!v)}
                                    />
                                    <span className="text-sm">Eliminar unidad ingresada por canje</span>
                                </label>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeConfirmCancelDialog}>
                            Volver
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={proceedCancelSale}
                            disabled={confirmCancelProcessing}
                        >
                            {confirmCancelProcessing ? "Cancelando..." : "Confirmar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 📄 Paginación */}
            {/* 📄 Paginación Shadcn */}
            <Pagination className="mt-10 flex justify-center">
                <PaginationContent>

                    {/* Botón Anterior */}
                    <PaginationItem>
                        <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                if (page > 1) setPage((p) => p - 1);
                            }}
                            className={page === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                    </PaginationItem>

                    {/* Primera página */}
                    {page > 3 && (
                        <PaginationItem>
                            <PaginationLink
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setPage(1);
                                }}
                            >
                                1
                            </PaginationLink>
                        </PaginationItem>
                    )}

                    {/* ... */}
                    {page > 4 && (
                        <PaginationItem>
                            <PaginationEllipsis />
                        </PaginationItem>
                    )}

                    {/* Páginas anteriores */}
                    {page > 1 && (
                        <PaginationItem>
                            <PaginationLink
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setPage(page - 1);
                                }}
                            >
                                {page - 1}
                            </PaginationLink>
                        </PaginationItem>
                    )}

                    {/* Página actual */}
                    <PaginationItem>
                        <PaginationLink
                            href="#"
                            isActive
                        >
                            {page}
                        </PaginationLink>
                    </PaginationItem>

                    {/* Página siguiente */}
                    {page < totalPages && (
                        <PaginationItem>
                            <PaginationLink
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setPage(page + 1);
                                }}
                            >
                                {page + 1}
                            </PaginationLink>
                        </PaginationItem>
                    )}

                    {/* ... */}
                    {page < totalPages - 3 && (
                        <PaginationItem>
                            <PaginationEllipsis />
                        </PaginationItem>
                    )}

                    {/* Última página */}
                    {page < totalPages - 2 && (
                        <PaginationItem>
                            <PaginationLink
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setPage(totalPages);
                                }}
                            >
                                {totalPages}
                            </PaginationLink>
                        </PaginationItem>
                    )}

                    {/* Botón Siguiente */}
                    <PaginationItem>
                        <PaginationNext
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                if (page < totalPages) setPage((p) => p + 1);
                            }}
                            className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                        />
                    </PaginationItem>

                </PaginationContent>
            </Pagination>

        </div>
    );
}
