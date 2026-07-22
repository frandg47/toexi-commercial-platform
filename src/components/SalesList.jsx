"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAdminSales } from "../utils/getAdminSales";

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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

const buildSaleMovementHistory = (payment, movement) => {
    const isUsdPayment = payment.amount_usd != null && Number(payment.amount_usd) !== 0;
    const movementAmount = movement?.amount;
    const movementCurrency = movement?.currency;

    return {
        movement_date: movement?.movement_date || toDateKeyAR(new Date()),
        account_id: payment.account_id,
        type: "transfer",
        amount: movementAmount != null
            ? Number(movementAmount || 0)
            : isUsdPayment ? Number(payment.amount_usd || 0) : Number(payment.amount_ars || 0),
        currency: movementCurrency || (isUsdPayment ? "USD" : "ARS"),
        amount_ars: movementCurrency === "ARS" || (!movementCurrency && !isUsdPayment)
            ? Number(movement?.amount_ars ?? payment.amount_ars ?? 0)
            : null,
        fx_rate_used: null,
        related_table: "sale_payment_history",
        related_id: payment.id,
        accreditation_status: movement?.accreditation_status || "credited",
        available_on: movement?.available_on || movement?.movement_date || toDateKeyAR(new Date()),
        notes: `Historial de cobro de venta #${payment.sale_id}`,
    };
};

const buildSaleReversalMovement = (payment, saleId, reason, movement) => {
    const isUsdPayment = payment.amount_usd != null && Number(payment.amount_usd) !== 0;
    const movementAmount = movement?.amount;
    const movementCurrency = movement?.currency;

    return {
        movement_date: toDateKeyAR(new Date()),
        account_id: payment.account_id,
        type: "expense",
        amount: movementAmount != null
            ? Number(movementAmount || 0)
            : isUsdPayment ? Number(payment.amount_usd || 0) : Number(payment.amount_ars || 0),
        currency: movementCurrency || (isUsdPayment ? "USD" : "ARS"),
        amount_ars: movementCurrency === "ARS" || (!movementCurrency && !isUsdPayment)
            ? Number(movement?.amount_ars ?? payment.amount_ars ?? 0)
            : null,
        fx_rate_used: null,
        related_table: "sale_reversal",
        related_id: payment.id,
        accreditation_status: "credited",
        available_on: toDateKeyAR(new Date()),
        notes: `Anulacion de venta #${saleId}${reason ? ` | Motivo: ${reason}` : ""}`,
    };
};

const formatVariantLabel = (item) => {
    if (!item) return "-";
    const parts = [item.product_name, item.variant_name, item.color && `(${item.color})`]
        .filter(Boolean);
    return parts.join(" ");
};

const formatWarrantyBucket = (bucket) =>
    bucket === "defective" ? "Defectuoso" : "Disponible";

const formatWarrantyVariantForNote = (variant) =>
    [
        variant?.products?.name,
        variant?.variant_name,
        variant?.color ? `(${variant.color})` : null,
    ]
        .filter(Boolean)
        .join(" ") || "-";

const normalizeIdentifier = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const isSerialTrackedVariant = (variant) =>
    variant?.products?.inventory_tracking_mode === "serial";

const buildWarrantyPdfLines = (warranties = []) =>
    warranties.flatMap((warranty) => {
        const lines = [
            `Detalle: ${warranty.reason || "-"}`,
            `Ingreso del equipo devuelto a: ${formatWarrantyBucket(warranty.returned_stock_bucket)}`,
        ];

        if (Math.abs(Number(warranty.price_difference_usd || 0)) > 0.009) {
            lines.push(
                `${warranty.settlement_type === "customer_refund" ? "Reintegro" : "Diferencia cobrada"}: ${
                    warranty.settlement_currency || ""
                } ${Number(warranty.settlement_amount || 0).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })} (${Number(warranty.price_difference_usd || 0).toFixed(2)} USD)`,
            );
        }

        if (warranty.settlement_method?.name) {
            lines.push(
                `Metodo: ${warranty.settlement_method.name}${
                    warranty.settlement_installments
                        ? ` | ${warranty.settlement_installments} cuotas`
                        : ""
                }${
                    Number(warranty.settlement_multiplier || 1) > 1
                        ? ` | x${Number(warranty.settlement_multiplier).toFixed(2)}`
                        : ""
                }`,
            );
        }

        if (warranty.notes) {
            lines.push(`Notas de garantia: ${warranty.notes}`);
        }

        if (Number(warranty.store_credit_usd || 0) > 0.009) {
            lines.push(
                `Credito a favor proxima compra: USD ${Number(
                    warranty.store_credit_usd || 0,
                ).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}`,
            );
        }

        return lines;
    });

const buildWarrantyPdfRows = (warranties = []) =>
    warranties.flatMap((warranty) => {
        const replacementItems =
            warranty.replacement_items?.length > 0
                ? warranty.replacement_items
                : [
                      {
                          variant: warranty.replacement_variant,
                          imei: warranty.replacement_imei,
                          quantity: warranty.quantity,
                      },
                  ];

        return replacementItems.map((replacement, index) => [
            index === 0 ? formatWarrantyVariantForNote(warranty.original_variant) : "",
            index === 0 ? warranty.original_imei || "-" : "",
            formatWarrantyVariantForNote(replacement.variant),
            replacement.imei || "-",
            String(replacement.quantity || 1),
            index === 0
                ? warranty.settlement_method?.name
                    ? `${warranty.settlement_method.name}${
                          warranty.settlement_installments
                              ? ` (${warranty.settlement_installments} cuotas)`
                              : ""
                      }`
                    : Number(warranty.store_credit_usd || 0) > 0.009
                      ? "Credito proxima compra"
                      : "-"
                : "",
        ]);
    });

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
                  })
                : "-";
            const newDate = newValue
                ? new Date(newValue).toLocaleString("es-AR", {
                      timeZone: AR_TIMEZONE,
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


    // �️ Estados para anulación
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelingSale, setCancelingS] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [bucketOpen, setBucketOpen] = useState(false);
    const [selectedBucket, setSelectedBucket] = useState("available");
    const [cancelingProcess, setCancelingProcess] = useState(false);
    const [warrantyOpen, setWarrantyOpen] = useState(false);
    const [warrantyProcessing, setWarrantyProcessing] = useState(false);
    const [warrantySale, setWarrantySale] = useState(null);
    const [warrantyItems, setWarrantyItems] = useState([]);
    const [replacementOptions, setReplacementOptions] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [paymentInstallments, setPaymentInstallments] = useState([]);
    const [accounts, setAccounts] = useState([]);
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
    const warrantyPriceDiff = useMemo(() => {
        if (!selectedWarrantyItem || replacementRowsDetailed.length === 0) {
            return {
                originalTotalUsd: 0,
                replacementTotalUsd: 0,
                differenceUsd: 0,
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

        return {
            originalTotalUsd,
            replacementTotalUsd,
            differenceUsd,
            storeCreditUsd: differenceUsd < 0 ? Math.abs(differenceUsd) : 0,
        };
    }, [replacementRowsDetailed, selectedWarrantyItem]);
    const selectedSettlementAccount = useMemo(
        () =>
            accounts.find(
                (account) =>
                    String(account.id) === String(warrantySettlementAccountId),
            ) || null,
        [accounts, warrantySettlementAccountId],
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
        if (!selectedSettlementMethod) return accounts;
        const currency = getPaymentDisplayCurrency(selectedSettlementMethod.name);
        return accounts.filter((account) => account.currency === currency);
    }, [accounts, selectedSettlementMethod]);
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
                    .select("id, name, currency, is_reference_capital")
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
                        "id, sale_id, sale_item_id, original_imei, replacement_imei, quantity, returned_stock_bucket, reason, notes, created_at, price_difference_usd, settlement_type, settlement_currency, settlement_amount, settlement_installments, settlement_multiplier, store_credit_usd, store_credit_amount_ars, settlement_method:payment_methods!warranty_exchanges_settlement_payment_method_id_fkey(id, name), original_variant:product_variants!warranty_exchanges_original_variant_id_fkey(id, variant_name, color, products(name)), replacement_variant:product_variants!warranty_exchanges_replacement_variant_id_fkey(id, variant_name, color, products(name))",
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

        // Validar que no sea una venta anulada
        if (editingSale.status === "anulado") {
            toast.error("No se puede editar una venta anulada");
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

    const startCancelSale = (sale) => {
        if (!canManageSaleActions) {
            toast.error("Solo owner o superadmin puede anular ventas");
            return;
        }
        setCancelingS(sale);
        setCancelReason("");
        setCancelOpen(true);
    };

    const closeCancelDialog = () => {
        setCancelOpen(false);
        setCancelingS(null);
        setCancelReason("");
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
    };

    const completeCancelSale = async () => {
        if (!cancelingSale) return;

        try {
            setCancelingProcess(true);
            const { data: salePayments, error: salePaymentsError } = await supabase
                .from("sale_payments")
                .select("id, sale_id, account_id, amount_ars, amount_usd, created_at")
                .eq("sale_id", cancelingSale.sale_id);

            if (salePaymentsError) throw salePaymentsError;

            const salePaymentIds = (salePayments || []).map((payment) => payment.id);
            let paymentMovementsMap = new Map();

            if (salePaymentIds.length > 0) {
                const { data: paymentMovements, error: paymentMovementsError } = await supabase
                    .from("account_movements")
                    .select("related_id, movement_date, amount, currency, amount_ars, accreditation_status, available_on")
                    .eq("related_table", "sale_payments")
                    .in("related_id", salePaymentIds);

                if (paymentMovementsError) throw paymentMovementsError;

                paymentMovementsMap = new Map(
                    (paymentMovements || []).map((movement) => [movement.related_id, movement])
                );
            }

            const { error } = await supabase.rpc("void_sale", {
                p_sale_id: cancelingSale.sale_id,
                p_reason: cancelReason,
                p_bucket: selectedBucket,
            });

            if (error) throw error;

            const historyMovements = (salePayments || [])
                .filter((payment) => payment.account_id)
                .map((payment) =>
                    buildSaleMovementHistory(
                        payment,
                        paymentMovementsMap.get(payment.id)
                    )
                );

            if (historyMovements.length > 0) {
                const { error: historyError } = await supabase
                    .from("account_movements")
                    .insert(historyMovements);

                if (historyError) {
                    throw new Error(
                        `La venta se anuló, pero no se pudo preservar el historial del cobro: ${historyError.message}`
                    );
                }
            }

            const reversalMovements = (salePayments || [])
                .filter((payment) => payment.account_id)
                .map((payment) =>
                    buildSaleReversalMovement(
                        payment,
                        cancelingSale.sale_id,
                        cancelReason,
                        paymentMovementsMap.get(payment.id)
                    )
                );

            if (reversalMovements.length > 0) {
                const { error: reversalError } = await supabase
                    .from("account_movements")
                    .insert(reversalMovements);

                if (reversalError) {
                    throw new Error(
                        `La venta se anuló, pero no se pudo registrar el movimiento inverso: ${reversalError.message}`
                    );
                }
            }

            toast.success("Venta anulada correctamente");
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
        if (sale.status === "anulado") {
            toast.error("No se puede gestionar garantia sobre una venta anulada");
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

        if (warrantyPriceDiff.differenceUsd > 0.009) {
            if (!warrantySettlementMethodId) {
                toast.error("Selecciona el metodo para liquidar la diferencia");
                return;
            }

            if (
                settlementInstallmentOptions.length > 0 &&
                !warrantySettlementInstallments
            ) {
                toast.error("Selecciona las cuotas para liquidar la diferencia");
                return;
            }

            if (!warrantySettlementAccountId) {
                toast.error("Selecciona la cuenta para liquidar la diferencia");
                return;
            }

            if (!warrantySettlementPreview) {
                toast.error("No se pudo calcular la diferencia con la cuenta elegida");
                return;
            }
        }

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
                p_settlement_account_id: warrantySettlementAccountId
                    ? Number(warrantySettlementAccountId)
                    : null,
                p_settlement_payment_method_id: warrantySettlementMethodId
                    ? Number(warrantySettlementMethodId)
                    : null,
                p_settlement_installments: warrantySettlementInstallments
                    ? Number(warrantySettlementInstallments)
                    : null,
                p_settlement_multiplier: settlementMultiplier || 1,
                p_settlement_currency: warrantySettlementPreview?.currency || null,
                p_settlement_amount: warrantySettlementPreview?.amount || null,
                p_settlement_amount_ars:
                    warrantySettlementPreview?.amount_ars ?? null,
                p_settlement_fx_rate_used:
                    warrantySettlementPreview?.fx_rate_used ?? null,
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
        try {
            const doc = new jsPDF();
            const margin = 14;
            const pageWidth = doc.internal.pageSize.getWidth();
            const contentWidth = pageWidth - margin * 2;
            let y = margin;
            const saleWarranties = warrantiesBySale[sale.sale_id] || [];

            // Logo
            const logoWidth = 22;
            const logoHeight = 22;
            const logoX = pageWidth - logoWidth - margin;
            doc.addImage("/toexi.jpg", "JPEG", logoX - 2, margin - 8, logoWidth, logoHeight);

            // Encabezado
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text("COMPROBANTE DE VENTA", margin, y);

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`N°: VTA-${String(sale.sale_id).padStart(6, "0")}`, margin, y + 6);

            y += 26;

            // Cliente / Fechas
            const fecha = new Date(sale.sale_date).toLocaleDateString("es-AR", {
                timeZone: AR_TIMEZONE,
            });

            doc.setFontSize(11);
            doc.rect(margin, y, 180, 22);

            doc.text("Fecha:", margin + 4, y + 6);
            doc.text(fecha, margin + 40, y + 6);

            doc.text("Cliente:", margin + 4, y + 12);
            doc.text(
                `${sale.customer_name} ${sale.customer_last_name} (Tel: ${sale.customer_phone || "-"})`,
                margin + 40,
                y + 12
            );

            y += 30;

            // Vendedor
            const vendedorNombre = sale.seller_name && sale.seller_name.trim()
                ? `${sale.seller_name}${sale.seller_last_name ? ' ' + sale.seller_last_name : ''} (Tel: ${sale.seller_phone || "-"}) `
                : "Toexi Tech";

            doc.setFontSize(11);
            doc.rect(margin, y, 180, 16);

            doc.text("Vendedor:", margin + 4, y + 6);
            doc.text(vendedorNombre, margin + 40, y + 6);

            y += 24;
            autoTable(doc, {
                startY: y,
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0],
                    fontSize: 10,
                    fontStyle: "bold",
                    lineWidth: 0.3,
                    lineColor: [0, 0, 0],
                },
                bodyStyles: {
                    fontSize: 10,
                    lineWidth: 0.3,
                    lineColor: [0, 0, 0],
                },
                head: [["Producto", "Variante", "Color", "Cant", "IMEI/s", "Subtotal USD", "Subtotal ARS"]],
                body: sale.items?.map((i) => [
                    i.is_gift ? `${i.product_name} (REGALO)` : i.product_name,
                    i.variant_name || "Modelo Base",
                    i.color || "-",
                    i.quantity,
                    (i.imeis || []).join("\n"),
                    i.is_gift ? "USD 0.00" : `USD ${(i.subtotal_usd || i.usd_price * i.quantity).toFixed(2)}`,
                    i.is_gift ? "$0" : `$ ${Number(i.subtotal_ars).toLocaleString("es-AR")}`,
                ]) || [],
                columnStyles: {
                    0: { cellWidth: 32 },
                    1: { cellWidth: 32 },
                    2: { cellWidth: 18 },
                    3: { cellWidth: 12 },
                    4: { cellWidth: 30 },
                    5: { halign: "right", cellWidth: 30 },
                    6: { halign: "right", cellWidth: 26 },
                },
                theme: "plain",
                margin: { top: 0, right: 0, bottom: 0, left: margin },
                didDrawCell: (data) => {
                    const { table, row, column } = data;
                    const totalRows = table.body.length;
                    const totalCols = table.columns.length;

                    if (row.index === 0 && column.index === 0) {
                        data.cell.styles.lineWidth = [0, 0.3, 0.3, 0];
                    } else if (row.index === 0 && column.index === totalCols - 1) {
                        data.cell.styles.lineWidth = [0, 0, 0.3, 0.3];
                    } else if (row.index === totalRows - 1 && column.index === 0) {
                        data.cell.styles.lineWidth = [0.3, 0.3, 0, 0];
                    } else if (row.index === totalRows - 1 && column.index === totalCols - 1) {
                        data.cell.styles.lineWidth = [0.3, 0, 0, 0.3];
                    } else if (row.index === 0) {
                        data.cell.styles.lineWidth = [0, 0.3, 0.3, 0.3];
                    } else if (row.index === totalRows - 1) {
                        data.cell.styles.lineWidth = [0.3, 0.3, 0, 0.3];
                    } else if (column.index === 0) {
                        data.cell.styles.lineWidth = [0.3, 0.3, 0.3, 0];
                    } else if (column.index === totalCols - 1) {
                        data.cell.styles.lineWidth = [0.3, 0, 0.3, 0.3];
                    } else {
                        data.cell.styles.lineWidth = [0.3, 0.3, 0.3, 0.3];
                    }
                }
            });

            y = doc.lastAutoTable.finalY + 10;

            // Resumen financiero
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");

            // doc.text(`Subtotal USD: USD ${sale.total_usd?.toFixed(2) || "0.00"}`, margin, y);
            // y += 6;

            const subtotalWithSurcharge =
                Number(sale.total_ars) + Number(sale.discount_amount || 0);

            doc.text(
                `Subtotal: $ ${subtotalWithSurcharge.toLocaleString("es-AR")}`,
                margin,
                y
            );
            y += 6;

            if (Number(sale.discount_amount) > 0) {
                doc.text(
                    `Descuento aplicado: -$ ${Number(sale.discount_amount).toLocaleString("es-AR")}`,
                    margin,
                    y
                );
                y += 6;
            }

            // doc.setFontSize(14);
            // doc.setFont("helvetica", "bold");
            // doc.setTextColor(0, 100, 200);
            // doc.text(
            //     `TOTAL: $ ${Number(sale.total_ars).toLocaleString("es-AR")}`,
            //     margin,
            //     y
            // );
            // y += 14;

            doc.text(`Cotización aplicada: $ ${sale.fx_rate_used}`, margin, y);
            y += 14;

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 100, 200);
            doc.text(`TOTAL: $ ${Number(sale.total_ars).toLocaleString("es-AR")}`, margin, y);

            y += 14;

            // Métodos de pago
            doc.setFontSize(11);
            doc.setTextColor(0);
            doc.setFont("helvetica", "bold");
            doc.text("Formas de Pago:", margin, y);
            y += 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            sale.payments?.forEach((p) => {
                doc.text(
                    `• ${p.payment_method_name}${p.installments ? ` (${p.installments} cuotas)` : ""}: $ ${Number(p.amount_ars).toLocaleString("es-AR")}`,
                    margin,
                    y
                );
                y += 5;
            });

            const noteLines = doc.splitTextToSize(`Nota: ${sale.notes || "-"}`, contentWidth);
            doc.text(noteLines, margin, y += 8);
            y += noteLines.length * 5;

            if (saleWarranties.length > 0) {
                y += 3;
                doc.setFont("helvetica", "bold");
                doc.text("Detalle de garantia:", margin, y);
                y += 6;

                autoTable(doc, {
                    startY: y,
                    headStyles: {
                        fillColor: [255, 255, 255],
                        textColor: [0, 0, 0],
                        fontSize: 9,
                        fontStyle: "bold",
                        lineWidth: 0.3,
                        lineColor: [0, 0, 0],
                    },
                    bodyStyles: {
                        fontSize: 9,
                        lineWidth: 0.3,
                        lineColor: [0, 0, 0],
                    },
                    head: [["Equipo original", "IMEI devuelto", "Reemplazo", "IMEI nuevo", "Cant", "Pago diferencia"]],
                    body: buildWarrantyPdfRows(saleWarranties),
                    columnStyles: {
                        0: { cellWidth: 34 },
                        1: { cellWidth: 26 },
                        2: { cellWidth: 34 },
                        3: { cellWidth: 26 },
                        4: { halign: "center", cellWidth: 14 },
                        5: { cellWidth: 36 },
                    },
                    theme: "plain",
                    margin: { top: 0, right: 0, bottom: 0, left: margin },
                });

                y = doc.lastAutoTable.finalY + 6;
                doc.setFont("helvetica", "normal");
                const warrantyLines = buildWarrantyPdfLines(saleWarranties).flatMap((line) =>
                    doc.splitTextToSize(line, contentWidth),
                );
                doc.text(warrantyLines, margin, y);
                y += warrantyLines.length * 5;
            }


            // =============================
            //  FOOTER LEGAL + DATOS EMPRESA
            // =============================
            const pageHeight = doc.internal.pageSize.getHeight();
            const footerCenter = pageWidth / 2;

            let fY = pageHeight - 24;

            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(60);
            doc.text("TOEXI TECH", footerCenter, fY, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);

            doc.text("Teléfono: 381 364 5246", footerCenter, fY + 5, { align: "center" });
            doc.text("Instagram: @toexi.tech", footerCenter, fY + 10, { align: "center" });

            // Legal
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text("Gracias por su compra", footerCenter, fY + 17, { align: "center" });

            doc.save(`venta_${sale.sale_id}.pdf`);
            toast.success("PDF descargado correctamente");

        } catch (err) {
            console.error("Error generando PDF:", err);
            toast.error("Error al generar PDF");
        }
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
                    <Card key={s.sale_id} className="p-5 shadow-md w-full">
                        <div className="flex justify-between">
                            <h2 className="font-bold text-lg">Venta #{s.sale_id}</h2>
                            <span className="text-sm text-muted-foreground">
                                {new Date(s.sale_date).toLocaleString("es-AR", {
                                    timeZone: AR_TIMEZONE,
                                })}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
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
                                            s.status === "pending" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400" : ""
                                        }
                                    >
                                        {s.status === "anulado" ? "ANULADA" : s.status === "pending" ? "PENDIENTE" : s.status}
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
                                    {i.imei && i.imei.toString().trim() !== "" && <div className="text-xs text-muted-foreground">IMEI: {i.imei}</div>}
                                </div>
                            ))}
                        </div>

                        {/* Pagos */}
                        <div className="text-sm border rounded p-3 mt-3 bg-muted/40">
                            <strong>Métodos de pago:</strong>
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
                                                        {warranty.settlement_type === "customer_refund"
                                                            ? "Reintegro"
                                                            : "Diferencia cobrada"}
                                                        :
                                                    </strong>{" "}
                                                    {warranty.settlement_currency}{" "}
                                                    {Number(warranty.settlement_amount || 0).toLocaleString(
                                                        "es-AR",
                                                        {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        },
                                                    )}{" "}
                                                    ({Number(warranty.price_difference_usd || 0).toFixed(2)} USD)
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
                                        disabled={s.status === "anulado"}
                                    >
                                        Editar venta
                                    </Button>
                                    )}
                                    {canManageSaleActions && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => openWarrantyDialog(s)}
                                        disabled={s.status === "anulado"}
                                    >
                                        <IconShieldCheck className="mr-2 h-4 w-4" />
                                        Garantia
                                    </Button>
                                    )}
                                    {canManageSaleActions && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => startCancelSale(s)}
                                        disabled={s.status === "anulado"}
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
                                <strong>
                                    {warrantyPriceDiff.differenceUsd > 0
                                        ? "Cliente paga diferencia:"
                                        : warrantyPriceDiff.differenceUsd < 0
                                            ? "Credito a favor proxima compra:"
                                            : "Sin diferencia de precio:"}
                                </strong>{" "}
                                USD{" "}
                                {Math.abs(
                                    Number(warrantyPriceDiff.differenceUsd || 0),
                                ).toLocaleString("es-AR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                        </div>

                        {warrantyPriceDiff.differenceUsd > 0.009 && (
                            <div className="space-y-4 rounded-md border border-dashed p-4">
                                <div className="space-y-2">
                                    <Label>Metodo para la diferencia</Label>
                                    <Select
                                        value={warrantySettlementMethodId}
                                        onValueChange={(value) => {
                                            setWarrantySettlementMethodId(value);
                                            setWarrantySettlementInstallments("");
                                            const nextMethod = paymentMethods.find(
                                                (method) =>
                                                    String(method.id) === String(value),
                                            );
                                            const currency = getPaymentDisplayCurrency(
                                                nextMethod?.name,
                                            );
                                            const nextAccounts = accounts.filter(
                                                (account) => account.currency === currency,
                                            );
                                            if (nextAccounts.length === 1) {
                                                setWarrantySettlementAccountId(
                                                    String(nextAccounts[0].id),
                                                );
                                            } else {
                                                setWarrantySettlementAccountId("");
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar metodo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentMethods.map((method) => (
                                                <SelectItem
                                                    key={method.id}
                                                    value={String(method.id)}
                                                >
                                                    {method.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {settlementInstallmentOptions.length > 0 && (
                                    <div className="space-y-2">
                                        <Label>Cuotas</Label>
                                        <Select
                                            value={warrantySettlementInstallments}
                                            onValueChange={setWarrantySettlementInstallments}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar cuotas" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {settlementInstallmentOptions.map((inst) => (
                                                    <SelectItem
                                                        key={inst.id}
                                                        value={String(inst.installments)}
                                                    >
                                                        {inst.installments} cuotas
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>
                                        Cuenta donde ingresa la diferencia
                                    </Label>
                                    <Select
                                        value={warrantySettlementAccountId}
                                        onValueChange={setWarrantySettlementAccountId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar cuenta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {settlementAccounts.map((account) => (
                                                <SelectItem
                                                    key={account.id}
                                                    value={String(account.id)}
                                                >
                                                    {account.name} ({account.currency})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedSettlementAccount && (
                                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                                        {warrantySettlementPreview ? (
                                            <>
                                                <p>
                                                    <strong>
                                                        Cobro estimado:
                                                    </strong>{" "}
                                                    {warrantySettlementPreview.currency}{" "}
                                                    {Number(
                                                        warrantySettlementPreview.amount || 0,
                                                    ).toLocaleString("es-AR", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </p>
                                                {settlementMultiplier > 1 && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Multiplicador aplicado: x
                                                        {Number(settlementMultiplier).toFixed(2)}
                                                    </p>
                                                )}
                                                {warrantySettlementInstallments && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Cuotas: {warrantySettlementInstallments}
                                                    </p>
                                                )}
                                                {warrantySettlementPreview.amount_ars != null && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Equivalente ARS: $
                                                        {Number(
                                                            warrantySettlementPreview.amount_ars,
                                                        ).toLocaleString("es-AR", {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                No se pudo calcular la diferencia para la cuenta elegida.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {warrantyPriceDiff.storeCreditUsd > 0.009 && (
                            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
                                <p>
                                    <strong>Credito a favor para proxima compra:</strong> USD{" "}
                                    {Number(warrantyPriceDiff.storeCreditUsd || 0).toLocaleString(
                                        "es-AR",
                                        {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        },
                                    )}
                                </p>
                                {fxRate && (
                                    <p className="text-xs text-sky-800/80 dark:text-sky-200/80">
                                        Equivalente estimado ARS: ${" "}
                                        {Number(
                                            warrantyPriceDiff.storeCreditUsd * Number(fxRate),
                                        ).toLocaleString("es-AR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </p>
                                )}
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
