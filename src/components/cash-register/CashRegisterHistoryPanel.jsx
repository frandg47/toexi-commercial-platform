import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconHistory, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";
import CashRegisterHistory from "./CashRegisterHistory";
import CashRegisterDetail from "./CashRegisterDetail";
import DialogCloseCashRegister from "./DialogCloseCashRegister";

const PAGE_SIZE = 20;

export default function CashRegisterHistoryPanel() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    userId: "all",
    status: "all",
  });
  const [selectedRegister, setSelectedRegister] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [closeRegisterData, setCloseRegisterData] = useState(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("cash_registers")
      .select("*", { count: "exact" })
      .order("register_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (filters.dateFrom) query = query.gte("register_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("register_date", filters.dateTo);
    if (filters.userId !== "all") query = query.eq("user_id", filters.userId);
    if (filters.status !== "all") query = query.eq("status", filters.status);

    const { data, error, count } = await query;
    if (error) {
      toast.error("No se pudo cargar el historial de cajas", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    const userIds = [
      ...new Set(
        (data || []).map((register) => register.user_id).filter(Boolean),
      ),
    ];
    const { data: registerUsers } = userIds.length
      ? await supabase
          .from("users")
          .select("id_auth, name, last_name, email")
          .in("id_auth", userIds)
      : { data: [] };
    const usersById = Object.fromEntries(
      (registerUsers || []).map((user) => [user.id_auth, user]),
    );

    setHistory(
      (data || []).map((register) => ({
        ...register,
        users: usersById[register.user_id] || null,
      })),
    );
    setTotalCount(count || 0);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const openCloseRegister = async (register) => {
    setCloseLoading(true);

    const [movementsResponse, accountMovementsResponse, blueRateResponse, usdtRateResponse, cashAccountsResponse] =
      await Promise.all([
        supabase
          .from("cash_register_movements")
          .select("*, accounts!cash_register_movements_account_id_fkey(name, currency, is_efectivo, is_caja_virtual)")
          .eq("cash_register_id", register.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("account_movements")
          .select("*, accounts(name, currency)")
          .in("related_table", ["cash_register", "cash_register_opening_adjustment"])
          .eq("related_id", register.id),
        supabase
          .from("fx_rates")
          .select("rate")
          .eq("source", "blue")
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("accounts")
          .select("id")
          .eq("is_efectivo", true),
        supabase
          .from("fx_rates")
          .select("rate")
          .eq("source", "USDT")
          .eq("is_active", true)
          .maybeSingle(),
      ]);

    const error =
      movementsResponse.error ||
      accountMovementsResponse.error ||
      blueRateResponse.error ||
      usdtRateResponse.error ||
      cashAccountsResponse.error;

    if (error) {
      toast.error("No se pudo cargar la caja para cerrar", {
        description: error.message,
      });
      setCloseLoading(false);
      return;
    }

    setExchangeRate(Number(blueRateResponse.data?.rate || 0) || null);
    setUsdtRate(Number(usdtRateResponse.data?.rate || 0) || null);
    setCloseRegisterData({
      register,
      movements: movementsResponse.data || [],
      accountMovements: accountMovementsResponse.data || [],
      efectivoAccounts: cashAccountsResponse.data || [],
    });
    setCloseLoading(false);
    setCloseDialogOpen(true);
  };

  const closeHistoricalRegister = async (amounts, notes) => {
    if (!closeRegisterData?.register) {
      return { ok: false, error: "No hay caja seleccionada" };
    }

    setCloseLoading(true);
    try {
      const { error } = await supabase.rpc("close_cash_register", {
        p_register_id: closeRegisterData.register.id,
        p_closed_amounts: amounts,
        p_notes: notes,
      });

      if (error) throw error;

      const { data: updatedRegister, error: updatedError } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("id", closeRegisterData.register.id)
        .single();

      if (updatedError) throw updatedError;

      const { data: closedMovements, error: movementsError } = await supabase
        .from("cash_register_movements")
        .select("*, accounts!cash_register_movements_account_id_fkey(name, currency, is_efectivo, is_caja_virtual)")
        .eq("cash_register_id", closeRegisterData.register.id)
        .order("created_at", { ascending: true });

      if (movementsError) throw movementsError;

      await loadHistory();
      return {
        ok: true,
        register: { ...updatedRegister, users: closeRegisterData.register.users },
        movements: closedMovements || [],
      };
    } catch (error) {
      console.error("Error cerrando caja desde historial:", error);
      return { ok: false, error: error.message };
    } finally {
      setCloseLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <Card className="">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <IconHistory className="h-5 w-5" />
            Historial de cajas
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadHistory}
            disabled={loading}
          >
            <IconRefresh className="mr-1 h-4 w-4" />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Desde</span>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  updateFilter("dateFrom", event.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Hasta</span>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
              />
            </div>
            {/* <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Usuario</span>
              <Select
                value={filters.userId}
                onValueChange={(value) => updateFilter("userId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los usuarios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los usuarios</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id_auth} value={user.id_auth}>
                      {[user.name, user.last_name].filter(Boolean).join(" ") ||
                        user.email ||
                        user.id_auth}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Estado</span>
              <Select
                value={filters.status}
                onValueChange={(value) => updateFilter("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abiertas</SelectItem>
                  <SelectItem value="closed">Cerradas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </div> */}

          <CashRegisterHistory
            history={history}
            loading={loading}
            onViewDetail={(register) => {
              setSelectedRegister(register);
              setDetailOpen(true);
            }}
            onCloseRegister={openCloseRegister}
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{totalCount} cajas encontradas</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>

        <CashRegisterDetail
          register={selectedRegister}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />

        {closeRegisterData && (
          <DialogCloseCashRegister
            open={closeDialogOpen}
            onOpenChange={setCloseDialogOpen}
            register={closeRegisterData.register}
            movements={closeRegisterData.movements}
            onConfirm={closeHistoricalRegister}
            loading={closeLoading}
            exchangeRate={exchangeRate}
            usdtRate={usdtRate}
            accountMovements={closeRegisterData.accountMovements}
            efectivoAccounts={closeRegisterData.efectivoAccounts}
          />
        )}
      </Card>
    </div>
  );
}
