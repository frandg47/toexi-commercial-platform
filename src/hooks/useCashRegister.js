import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

function addBusinessDays(startDate, days) {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export function useCashRegister(userId) {
  const [currentRegister, setCurrentRegister] = useState(null);
  const [movements, setMovements] = useState([]);
  const [pendingSales, setPendingSales] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [virtualAccounts, setVirtualAccounts] = useState([]);
  const [efectivoAccounts, setEfectivoAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [accountMovements, setAccountMovements] = useState([]);
  const [staleOpenRegister, setStaleOpenRegister] = useState(null);
  const [cajaBalances, setCajaBalances] = useState({ ARS: 0, USD: 0, USDT: 0 });

  const computeCajaBalances = useCallback((movs) => {
    const result = { ARS: 0, USD: 0, USDT: 0 };
    for (const m of movs) {
      const cur = m.currency || "ARS";
      if (!result[cur]) result[cur] = 0;
      if (["opening", "sale_income", "income", "transfer_in"].includes(m.type)) {
        result[cur] += Number(m.amount || 0);
      }
      if (["expense", "withdrawal", "transfer_out"].includes(m.type)) {
        result[cur] -= Number(m.amount || 0);
      }
    }
    return result;
  }, []);

  const loadMovements = useCallback(async (registerId) => {
    if (!registerId) return;
    try {
      const { data, error } = await supabase
        .from("cash_register_movements")
        .select("*, accounts!cash_register_movements_account_id_fkey(name, currency, is_efectivo, is_caja_virtual)")
        .eq("cash_register_id", registerId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMovements(data || []);
      setCajaBalances(computeCajaBalances(data || []));
    } catch (err) {
      console.error("Error loading movements:", err);
    }
  }, [computeCajaBalances]);

  const loadPendingSales = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          customers:customer_id(name, last_name, phone),
          sale_items(id, product_name, variant_name, color, storage, ram, usd_price, quantity, subtotal_ars, is_gift)
        `)
        .eq("status", "pending")
        .order("sale_date", { ascending: false });

      if (error) throw error;
      setPendingSales(data || []);
    } catch (err) {
      console.error("Error loading pending sales:", err);
    }
  }, []);

  const loadVirtualAccounts = useCallback(async () => {
    try {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, name, currency, initial_balance, is_caja_virtual")
        .eq("is_caja_virtual", true)
        .order("name");

      if (!accounts?.length) {
        setVirtualAccounts([]);
        return;
      }

      const { data: movements } = await supabase
        .from("account_movements")
        .select("account_id, type, amount")
        .in("account_id", accounts.map((a) => a.id));

      const totals = new Map();
      (movements || []).forEach((m) => {
        const e = totals.get(m.account_id) || { income: 0, expense: 0 };
        if (m.type === "income") e.income += Number(m.amount || 0);
        else if (m.type === "expense") e.expense += Number(m.amount || 0);
        totals.set(m.account_id, e);
      });

      setVirtualAccounts(
        accounts.map((acc) => {
          const t = totals.get(acc.id) || { income: 0, expense: 0 };
          return {
            ...acc,
            current_balance: Number(acc.initial_balance || 0) + t.income - t.expense,
          };
        })
      );
    } catch (err) {
      console.error("Error loading virtual accounts:", err);
    }
  }, []);

  const loadAccountMovements = useCallback(async (registerId) => {
    if (!registerId) return;
    try {
      const { data } = await supabase
        .from("account_movements")
        .select("*, accounts!inner(name, currency)")
        .eq("related_table", "cash_register")
        .eq("related_id", registerId);
      setAccountMovements(data || []);
    } catch (err) {
      console.error("Error loading account movements:", err);
    }
  }, []);

  const loadEfectivoAccounts = useCallback(async () => {
    try {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, name, currency, initial_balance, is_efectivo")
        .eq("is_efectivo", true)
        .order("name");

      if (!accounts?.length) {
        setEfectivoAccounts([]);
        return;
      }

      const { data: movements } = await supabase
        .from("account_movements")
        .select("account_id, type, amount")
        .in("account_id", accounts.map((a) => a.id));

      const totals = new Map();
      (movements || []).forEach((m) => {
        const e = totals.get(m.account_id) || { income: 0, expense: 0 };
        if (m.type === "income") e.income += Number(m.amount || 0);
        else if (m.type === "expense") e.expense += Number(m.amount || 0);
        totals.set(m.account_id, e);
      });

      setEfectivoAccounts(
        accounts.map((acc) => {
          const t = totals.get(acc.id) || { income: 0, expense: 0 };
          return {
            ...acc,
            current_balance: Number(acc.initial_balance || 0) + t.income - t.expense,
          };
        })
      );
    } catch (err) {
      console.error("Error loading efectivo accounts:", err);
    }
  }, []);

  const loadAllAccounts = useCallback(async () => {
    try {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, name, currency, initial_balance, is_reference_capital, is_caja_virtual, is_efectivo")
        .eq("is_reference_capital", false)
        .order("name");

      if (!accounts?.length) {
        setAllAccounts([]);
        return;
      }

      const { data: movements } = await supabase
        .from("account_movements")
        .select("account_id, type, amount")
        .in("account_id", accounts.map((a) => a.id));

      const totals = new Map();
      (movements || []).forEach((m) => {
        const e = totals.get(m.account_id) || { income: 0, expense: 0 };
        if (m.type === "income") e.income += Number(m.amount || 0);
        else if (m.type === "expense") e.expense += Number(m.amount || 0);
        totals.set(m.account_id, e);
      });

      setAllAccounts(
        accounts.map((acc) => {
          const t = totals.get(acc.id) || { income: 0, expense: 0 };
          return {
            ...acc,
            current_balance: Number(acc.initial_balance || 0) + t.income - t.expense,
          };
        })
      );
    } catch (err) {
      console.error("Error loading all accounts:", err);
    }
  }, []);

  // 🔄 Realtime: escuchar cambios en sales, cash_register_movements y account_movements
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("cash_register_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sales" },
        () => {
          loadPendingSales();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales" },
        () => {
          loadPendingSales();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cash_register_movements" },
        () => {
          if (currentRegister?.id) {
            loadMovements(currentRegister.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cash_register_movements" },
        () => {
          if (currentRegister?.id) {
            loadMovements(currentRegister.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "account_movements" },
        () => {
          loadVirtualAccounts();
          loadEfectivoAccounts();
          loadAllAccounts();
          if (currentRegister?.id) {
            loadAccountMovements(currentRegister.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "account_movements" },
        () => {
          loadVirtualAccounts();
          loadEfectivoAccounts();
          loadAllAccounts();
          if (currentRegister?.id) {
            loadAccountMovements(currentRegister.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadPendingSales, currentRegister?.id, loadMovements, loadVirtualAccounts, loadEfectivoAccounts, loadAllAccounts, loadAccountMovements]);

  // 🔄 Custom event: cuando se crea una venta desde SheetNewSale
  useEffect(() => {
    const handler = () => loadPendingSales();
    window.addEventListener("sale-created", handler);
    return () => window.removeEventListener("sale-created", handler);
  }, [loadPendingSales]);

  // 🔄 Custom event: cuando se cancela una venta desde SalesList
  useEffect(() => {
    const handler = () => loadPendingSales();
    window.addEventListener("sale-cancelled", handler);
    return () => window.removeEventListener("sale-cancelled", handler);
  }, [loadPendingSales]);

  // 🔄 Refresh pending sales when user returns to the tab (cross-page updates)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadPendingSales();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadPendingSales]);

  const checkOpenRegister = useCallback(async () => {
    if (!userId) return null;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // Buscar caja abierta de HOY
      const { data: todayData, error: todayError } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("user_id", userId)
        .eq("register_date", today)
        .eq("status", "open")
        .maybeSingle();

      if (todayError) throw todayError;
      setCurrentRegister(todayData);
      if (todayData) {
        await loadMovements(todayData.id);
        await loadAccountMovements(todayData.id);
      }

      // Buscar cajas abiertas de OTROS días (pendientes de cierre)
      const { data: staleData } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("user_id", userId)
        .neq("register_date", today)
        .eq("status", "open")
        .order("register_date", { ascending: false })
        .maybeSingle();

      setStaleOpenRegister(staleData || null);
      // Si no hay caja de hoy pero hay stale, cargar sus movimientos para el dialog de cierre
      if (staleData && !todayData) {
        await loadMovements(staleData.id);
        await loadAccountMovements(staleData.id);
      }

      await loadPendingSales();
      await loadVirtualAccounts();
      await loadEfectivoAccounts();
      await loadAllAccounts();
      return todayData;
    } catch (err) {
      console.error("Error checking cash register:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, loadMovements, loadPendingSales, loadVirtualAccounts, loadEfectivoAccounts, loadAllAccounts, loadAccountMovements]);

  useEffect(() => {
    if (userId) checkOpenRegister();
  }, [userId, checkOpenRegister]);

  const openRegister = useCallback(
    async (openingAmounts, adjustments = []) => {
      setLoading(true);
      try {
        const amounts = openingAmounts || [{ currency: "ARS", amount: 0 }];

        const { data, error } = await supabase.rpc("open_cash_register", {
          p_amounts: amounts,
          p_adjustments: adjustments,
        });

        if (error) throw error;

        const newId = data;
        const { data: register } = await supabase
          .from("cash_registers")
          .select("*")
          .eq("id", newId)
          .single();

        setCurrentRegister(register);
        await loadMovements(newId);
        await loadAccountMovements(newId);
        await loadVirtualAccounts();
        await loadEfectivoAccounts();
        await loadAllAccounts();
        return { ok: true, register };
      } catch (err) {
        console.error("Error opening cash register:", err);
        return { ok: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [loadMovements, loadVirtualAccounts, loadEfectivoAccounts, loadAllAccounts, loadAccountMovements]
  );

  const closeRegister = useCallback(
    async (closedAmounts, notes = null) => {
      if (!currentRegister) return { ok: false, error: "No hay caja abierta" };
      setLoading(true);
      try {
        let amounts;
        if (Array.isArray(closedAmounts)) {
          amounts = closedAmounts;
        } else {
          amounts = [{ currency: "ARS", amount: Number(closedAmounts) || 0 }];
        }

        const { error } = await supabase.rpc("close_cash_register", {
          p_register_id: currentRegister.id,
          p_closed_amounts: amounts,
          p_notes: notes,
        });

        if (error) throw error;

        const { data: updated } = await supabase
          .from("cash_registers")
          .select("*")
          .eq("id", currentRegister.id)
          .single();

        const [{ data: closedMovements }, { data: user }] = await Promise.all([
          supabase
            .from("cash_register_movements")
            .select("*, accounts!cash_register_movements_account_id_fkey(name, currency)")
            .eq("cash_register_id", currentRegister.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("users")
            .select("name, last_name")
            .eq("id_auth", updated?.user_id)
            .maybeSingle(),
        ]);

        const enrichedRegister = { ...updated, users: user || null };
        setCurrentRegister(enrichedRegister);
        setMovements(closedMovements || []);
        return { ok: true, register: enrichedRegister, movements: closedMovements || [] };
      } catch (err) {
        console.error("Error closing cash register:", err);
        return { ok: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [currentRegister]
  );

  const registerMovement = useCallback(
    async (type, amount, currency, notes = null, relatedTable = null, relatedId = null, accountId = null, operationId = null) => {
      if (!currentRegister) return { ok: false, error: "No hay caja abierta" };
      setLoading(true);
      try {
        const { error } = await supabase.rpc("register_cash_movement", {
          p_register_id: currentRegister.id,
          p_type: type,
          p_amount: amount,
          p_currency: currency,
          p_notes: notes,
          p_related_table: relatedTable,
          p_related_id: relatedId,
          p_account_id: accountId,
          p_operation_id: operationId,
        });

        if (error) throw error;
        await loadMovements(currentRegister.id);
        return { ok: true };
      } catch (err) {
        console.error("Error registering movement:", err);
        return { ok: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [currentRegister, loadMovements]
  );

  const registerSaleInCash = useCallback(
    async (amount, currency, saleId) => {
      if (!currentRegister) return { ok: false, error: "No hay caja abierta" };
      setLoading(true);
      try {
        const { error } = await supabase.rpc("register_sale_in_cash_register", {
          p_register_id: currentRegister.id,
          p_amount: amount,
          p_currency: currency,
          p_sale_id: saleId,
        });

        if (error) throw error;
        await loadMovements(currentRegister.id);
        return { ok: true };
      } catch (err) {
        console.error("Error registering sale in cash:", err);
        return { ok: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [currentRegister, loadMovements]
  );

  const collectPendingSale = useCallback(
    async (saleId, paymentData) => {
      if (!currentRegister) return { ok: false, error: "No hay caja abierta" };
      setLoading(true);
      try {
        const { data: sale, error: saleError } = await supabase
          .from("sales")
          .select("*")
          .eq("id", saleId)
          .single();

        if (saleError) throw saleError;

        const { error: updateError } = await supabase
          .from("sales")
          .update({
            status: "vendido",
            payments: paymentData.payments || [],
            discount_type: paymentData.discount_type || null,
            discount_value: paymentData.discount_value || 0,
            discount_amount: paymentData.discount_amount || 0,
            surcharge_type: paymentData.surcharge_type || null,
            surcharge_value: paymentData.surcharge_value || 0,
            surcharge_amount: paymentData.surcharge_amount || 0,
            total_ars: paymentData.total_ars || sale.total_ars,
          })
          .eq("id", saleId);

        if (updateError) throw updateError;

        // Fetch payment_methods with account_id for card resolution
        const { data: pmLookup } = await supabase
          .from("payment_methods")
          .select("id, name, account_id, accreditation_delay_business_days, accounts(id, name, currency)")
          .eq("is_active", true);
        const pmMap = new Map((pmLookup || []).map((m) => [String(m.id), m]));

        // Create separate movements for each payment method
        const payments = paymentData.payments || [];
        const accreditationAudit = [];
        for (const p of payments) {
          if (!p.amount || p.amount <= 0) continue;
          
          const methodName = p.method_name || "Otros";
          const methodLower = methodName.toLowerCase();
          const isUSD = ["USD", "USDT"].includes(methodName?.toUpperCase());
          const pmRecord = pmMap.get(String(p.payment_method_id));
          const amountNum = Number(p.charged_amount || p.amount);
          const installmentsNum = p.installments ? Number(p.installments) : null;
          const multiplier = Math.max(Number(p.multiplier || 1), 1);
          const netAmount = multiplier > 1 ? amountNum / multiplier : amountNum;

          const accreditationDelay = Math.max(Number(pmRecord?.accreditation_delay_business_days || 0), 0);
          const accreditationStatus = accreditationDelay > 0 ? "pending" : "credited";
          const availableOn = addBusinessDays(new Date(), accreditationDelay).toISOString().slice(0, 10);

          // Resolve destination account_id
          let accountId = null;
          if (methodLower === "transferencia" && !p.destination_account_id) {
            throw new Error("La transferencia requiere una cuenta destino");
          }
          if (methodLower === "transferencia" && p.destination_account_id) {
            accountId = Number(p.destination_account_id);
          } else if (pmRecord?.account_id) {
            accountId = Number(pmRecord.account_id);
          } else {
            throw new Error(`El método ${methodName} no tiene una cuenta de acreditación configurada`);
          }

          // Insert into sale_payments — trigger trg_sale_payments_movement auto-creates account_movements
          const salePaymentPayload = {
            sale_id: saleId,
            payment_method_id: Number(p.payment_method_id),
            installments: installmentsNum,
            reference: p.reference || null,
            account_id: accountId,
          };
          if (isUSD) {
            salePaymentPayload.amount_usd = amountNum;
            salePaymentPayload.amount_ars = Number(p.amount_ars || 0);
          } else {
            salePaymentPayload.amount_ars = amountNum;
            salePaymentPayload.amount_usd = null;
          }

          const { data: spData, error: spError } = await supabase
            .from("sale_payments")
            .insert(salePaymentPayload)
            .select("id")
            .single();

          if (spError) throw spError;

          const accountName = accountId
            ? ` → ${methodLower === "transferencia"
              ? virtualAccounts.find((a) => a.id === accountId)?.name || ""
              : pmRecord?.accounts?.name || ""}`
            : "";
          const notes = `Venta #${saleId} - ${methodName}${accountName}`;
          
          const { error } = await supabase.rpc("register_cash_movement_v2", {
            p_register_id: currentRegister.id,
            p_type: "sale_income",
            p_amount: amountNum,
            p_currency: isUSD ? methodName.toUpperCase() : "ARS",
            p_notes: notes,
            p_related_table: "sales",
            p_related_id: saleId,
            p_payment_method_id: Number(p.payment_method_id),
            p_payment_method_name: methodName,
            p_reference: p.reference || null,
            p_multiplier: multiplier,
            p_net_amount: netAmount,
            p_accreditation_status: accreditationStatus,
            p_available_on: availableOn,
            p_sale_payment_id: spData?.id || null,
            p_account_id: accountId,
          });

          if (error) throw error;

          accreditationAudit.push({
            method_name: methodName,
            installments: installmentsNum,
            currency: isUSD ? methodName.toUpperCase() : "ARS",
            amount: amountNum,
            net_amount: netAmount,
            multiplier,
            account_id: accountId,
            account_name: methodLower === "transferencia"
              ? virtualAccounts.find((a) => a.id === accountId)?.name || ""
              : pmRecord?.accounts?.name || "",
            accreditation_status: accreditationStatus,
            available_on: availableOn,
            accreditation_delay_business_days: accreditationDelay,
          });
        }

        await loadMovements(currentRegister.id);
        await loadPendingSales();
        await loadEfectivoAccounts();
        await loadVirtualAccounts();
        return { ok: true, saleId, accreditationAudit };
      } catch (err) {
        console.error("Error collecting pending sale:", err);
        return { ok: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [currentRegister, loadMovements, loadPendingSales, virtualAccounts, loadEfectivoAccounts, loadVirtualAccounts]
  );

  const loadHistory = useCallback(
    async (filters = {}) => {
      setLoading(true);
      try {
        let query = supabase
          .from("cash_registers")
          .select("*")
          .order("register_date", { ascending: false })
          .limit(50);

        if (filters.userId) {
          query = query.eq("user_id", filters.userId);
        }
        if (filters.dateFrom) {
          query = query.gte("register_date", filters.dateFrom);
        }
        if (filters.dateTo) {
          query = query.lte("register_date", filters.dateTo);
        }
        if (filters.status) {
          query = query.eq("status", filters.status);
        }

        const { data, error } = await query;
        if (error) throw error;

        const registers = data || [];
        if (registers.length > 0) {
          const userIds = [...new Set(registers.map((r) => r.user_id))];
          const { data: usersData } = await supabase
            .from("users")
            .select("id_auth, name, last_name")
            .in("id_auth", userIds);

          const usersMap = Object.fromEntries(
            (usersData || []).map((u) => [u.id_auth, u])
          );

          const enriched = registers.map((r) => ({
            ...r,
            users: usersMap[r.user_id] || null,
          }));

          setHistory(enriched);
        } else {
          setHistory([]);
        }
      } catch (err) {
        console.error("Error loading history:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const closeStaleRegister = useCallback(
    async (closedAmounts, notes = null) => {
      if (!staleOpenRegister) return { ok: false, error: "No hay caja pendiente de cierre" };
      setLoading(true);
      try {
        let amounts;
        if (Array.isArray(closedAmounts)) {
          amounts = closedAmounts;
        } else {
          amounts = [{ currency: "ARS", amount: Number(closedAmounts) || 0 }];
        }

        const { error } = await supabase.rpc("close_cash_register", {
          p_register_id: staleOpenRegister.id,
          p_closed_amounts: amounts,
          p_notes: notes,
        });

        if (error) throw error;

        setStaleOpenRegister(null);
        setMovements([]);
        await loadHistory();
        return { ok: true };
      } catch (err) {
        console.error("Error closing stale register:", err);
        return { ok: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [staleOpenRegister, loadHistory]
  );

  const getBalance = useCallback(() => {
    if (!movements.length) return { ARS: 0, USD: 0, USDT: 0 };
    return movements.reduce(
      (acc, m) => {
        const currency = m.currency || "ARS";
        if (!acc[currency]) acc[currency] = 0;
        if (["opening", "sale_income", "income", "transfer_in"].includes(m.type)) {
          acc[currency] += Number(m.amount);
        }
        if (["expense", "withdrawal", "transfer_out"].includes(m.type)) {
          acc[currency] -= Number(m.amount);
        }
        return acc;
      },
      { ARS: 0, USD: 0, USDT: 0 }
    );
  }, [movements]);

  const getBalancesByCategory = useCallback(() => {
    const result = {
      ARS: { efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0 },
      USD: { efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0 },
      USDT: { efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0 },
    };

    for (const m of movements) {
      const cur = m.currency || "ARS";
      if (!result[cur]) result[cur] = { efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0 };

      const name = (m.payment_method_name || "").toLowerCase();
      const isExpense = ["expense", "withdrawal", "transfer_out"].includes(m.type);
      const amount = isExpense ? -Number(m.amount) : Number(m.amount);

      if (m.type === "transfer_in" || m.type === "transfer_out" || name.includes("transfer")) {
        result[cur].transferencia += amount;
      } else if (name.includes("tarjeta") || name.includes("card")) {
        result[cur].tarjeta += amount;
      } else {
        result[cur].efectivo += amount;
      }
    }

    return result;
  }, [movements]);

  const getPaymentsSummary = useCallback(() => {
    const result = {
      efectivo: { count: 0, amount: 0 },
      transferencia: { count: 0, amount: 0 },
      tarjeta: { count: 0, amount: 0, pending: 0 },
    };

    for (const m of movements) {
      if (m.type !== "income") continue;
      const name = (m.payment_method_name || "").toLowerCase();
      const amount = Number(m.amount);

      if (name.includes("transfer")) {
        result.transferencia.count++;
        result.transferencia.amount += amount;
      } else if (name.includes("tarjeta") || name.includes("card")) {
        result.tarjeta.count++;
        result.tarjeta.amount += Number(m.net_amount || amount);
        if (m.accreditation_status === "pending") {
          result.tarjeta.pending += Number(m.net_amount || amount);
        }
      } else {
        result.efectivo.count++;
        result.efectivo.amount += amount;
      }
    }

    return result;
  }, [movements]);

  return {
    currentRegister,
    isOpen: currentRegister?.status === "open",
    staleOpenRegister,
    movements,
    pendingSales,
    history,
    loading,
    virtualAccounts,
    efectivoAccounts,
    allAccounts,
    accountMovements,
    cajaBalances,
    checkOpenRegister,
    openRegister,
    closeRegister,
    closeStaleRegister,
    registerMovement,
    registerSaleInCash,
    collectPendingSale,
    loadMovements,
    loadPendingSales,
    loadHistory,
    loadVirtualAccounts,
    loadEfectivoAccounts,
    loadAllAccounts,
    loadAccountMovements,
    getBalance,
    getBalancesByCategory,
    getPaymentsSummary,
  };
}
