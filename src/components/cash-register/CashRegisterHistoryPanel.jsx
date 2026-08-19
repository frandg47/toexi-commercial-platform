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

const PAGE_SIZE = 20;

export default function CashRegisterHistoryPanel() {
  const [history, setHistory] = useState([]);
  const [users, setUsers] = useState([]);
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

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("users")
      .select("id_auth, name, last_name, email")
      .order("name", { ascending: true });

    if (!error) setUsers(data || []);
  }, []);

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
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ dateFrom: "", dateTo: "", userId: "all", status: "all" });
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
      </Card>
    </div>
  );
}
