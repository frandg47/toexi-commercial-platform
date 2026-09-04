import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import DialogAddCustomer from "./DialogAddCustomer";
import { IconPhone, IconPlus } from "@tabler/icons-react";
import DialogEditCustomer from "./DialogEditCustomer";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconRefresh,
  IconTrash,
  IconEdit,
  IconUser,
  IconHome,
  IconMapPin,
  IconColumns,
} from "@tabler/icons-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconIdBadge2 } from "@tabler/icons-react";
import { formatPersonName } from "@/utils/formatName";

// Formato de fecha local Argentina
const formatDate = (value) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(value));
  } catch (error) {
    console.error(error);
    return value;
  }
};

// Construir nombre completo
const buildFullName = (c) =>
  formatPersonName(c?.name, c?.last_name) || "Sin nombre";

const TABLE_COLUMNS = [
  { id: "name", label: "Cliente" },
  { id: "contact", label: "Contacto" },
  { id: "location", label: "Ubicación" },
  { id: "notes", label: "Notas" },
  { id: "created_at", label: "Creado" },
  { id: "status", label: "Estado" },
  { id: "actions", label: "Acciones" },
];

const CustomersTable = ({ refreshToken = 0, isSellerView }) => {
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [customers, setCustomers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    customer: null,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const baseColumns = useMemo(
    () =>
      isSellerView
        ? TABLE_COLUMNS.filter((c) => c.id !== "actions")
        : TABLE_COLUMNS,
    [isSellerView]
  );
  const [visibleColumns, setVisibleColumns] = useState(
    baseColumns.map((col) => col.id)
  );

  useEffect(() => {
    setVisibleColumns(baseColumns.map((col) => col.id));
  }, [baseColumns]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilter(filter.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [filter]);

  // Obtener clientes desde Supabase
  const fetchCustomers = useCallback(
    async (showSkeleton = false) => {
      if (showSkeleton) setLoading(true);
      else setRefreshing(true);

      try {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
          .from("customers")
          .select(
            "id, name, last_name, dni, phone, email, address, city, notes, is_active, created_at",
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range(from, to);

        if (debouncedFilter) {
          const term = `%${debouncedFilter}%`;
          query = query.or(
            `name.ilike.${term},last_name.ilike.${term},dni.ilike.${term},phone.ilike.${term},email.ilike.${term}`
          );
        }

        const { data, error, count } = await query;

        if (error) throw error;
        setCustomers(data ?? []);
        setTotalCount(count ?? 0);
      } catch (error) {
        console.error(error);
        toast.error("Error al cargar clientes", {
          description: error.message,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedFilter, page]
  );

  useEffect(() => {
    fetchCustomers(refreshToken === 0);
  }, [fetchCustomers, refreshToken]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilter, refreshToken]);

  // Eliminar cliente
  const handleConfirmDelete = useCallback(async () => {
    const c = deleteDialog.customer;
    if (!c) return;
    try {
      setRefreshing(true);
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", c.id);
      if (error) throw error;
      toast.success("Cliente eliminado", {
        description: `${buildFullName(c)} fue eliminado correctamente.`,
      });
      await fetchCustomers();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar el cliente", {
        description: error.message,
      });
    } finally {
      setRefreshing(false);
      setDeleteDialog({ open: false, customer: null });
    }
  }, [fetchCustomers, deleteDialog.customer]);

  const toggleColumn = useCallback((columnName) => {
    setVisibleColumns((current) =>
      current.includes(columnName)
        ? current.filter((col) => col !== columnName)
        : [...current, columnName]
    );
  }, []);

  const columnCount = visibleColumns.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:justify-between lg:flex-row lg:items-center lg:justify-between">
        {/* Buscador */}
        <Input
          placeholder="Buscar cliente..."
          onChange={(e) => setFilter(e.target.value)}
          className="w-full lg:w-80"
        />

        {/* Botones */}
        <div className="flex flex-wrap justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <IconColumns className="h-4 w-4" />
                <span>Columnas</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              {baseColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={visibleColumns.includes(col.id)}
                  onCheckedChange={() => toggleColumn(col.id)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            onClick={() => fetchCustomers(false)}
            disabled={refreshing}
          >
            <IconRefresh
              className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Actualizar
          </Button>

          <Button onClick={() => setDialogOpen(true)}>
            <IconPlus className="h-4 w-4" />
            Agregar
          </Button>

          <DialogAddCustomer
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onSuccess={() => fetchCustomers(false)}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.includes("name") && <TableHead>Cliente</TableHead>}
              {visibleColumns.includes("contact") && (
                <TableHead>Contacto</TableHead>
              )}
              {visibleColumns.includes("location") && (
                <TableHead>Ubicación</TableHead>
              )}
              {visibleColumns.includes("notes") && <TableHead>Notas</TableHead>}
              {visibleColumns.includes("created_at") && (
                <TableHead>Creado</TableHead>
              )}
              {visibleColumns.includes("status") && (
                <TableHead className="text-right">Estado</TableHead>
              )}
              {!isSellerView && visibleColumns.includes("actions") && (
                <TableHead className="text-right">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columnCount}>
                    <div className="grid gap-2">
                      {[...Array(3)].map((__, idx) => (
                        <Skeleton key={idx} className="h-10 w-full" />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

            {!loading && customers.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="text-center py-6 text-muted-foreground"
                >
                  No hay clientes registrados.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              customers.map((c) => (
                <TableRow key={c.id} className="align-top">
                  {visibleColumns.includes("name") && (
                    <TableCell className="font-semibold">
                      <div className="flex flex-col gap-1">
                        <span>{buildFullName(c)}</span>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <IconIdBadge2 className="h-4 w-4" />
                          {c.dni || "Sin DNI"}
                        </span>
                      </div>
                    </TableCell>
                  )}

                  {visibleColumns.includes("contact") && (
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-2">
                          <IconPhone className="h-4 w-4 text-muted-foreground" />
                          {c.phone || "-"}
                        </span>
                        <span className="flex items-center gap-2">
                          <IconUser className="h-4 w-4 text-muted-foreground" />
                          {c.email || "-"}
                        </span>
                      </div>
                    </TableCell>
                  )}

                  {visibleColumns.includes("location") && (
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-2">
                          <IconHome className="h-4 w-4 text-muted-foreground" />
                          {c.address || "-"}
                        </span>
                        <span className="flex items-center gap-2">
                          <IconMapPin className="h-4 w-4 text-muted-foreground" />
                          {c.city || "-"}
                        </span>
                      </div>
                    </TableCell>
                  )}

                  {visibleColumns.includes("notes") && (
                    <TableCell className="text-sm text-muted-foreground max-w-[240px]">
                      {c.notes ? (
                        <span className="flex items-start gap-2">
                          <IconEdit className="h-4 w-4 mt-[2px]" />
                          <span className="line-clamp-2">{c.notes}</span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  )}

                  {visibleColumns.includes("created_at") && (
                    <TableCell className="text-sm">
                      {formatDate(c.created_at)}
                    </TableCell>
                  )}

                  {visibleColumns.includes("status") && (
                    <TableCell className="text-right">
                      {c.is_active ? (
                        <Badge
                          variant="success"
                          className="bg-green-500 text-white"
                        >
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                  )}

                  {!isSellerView && visibleColumns.includes("actions") && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCustomerId(c.id)}
                        >
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        {/* <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            setDeleteDialog({ open: true, customer: c })
                          }
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button> */}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="text-sm text-muted-foreground">
          Mostrando {rangeStart}-{rangeEnd} de {totalCount}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Anterior
          </Button>
          <div className="text-sm">
            {page} / {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <DialogEditCustomer
        open={!!editingCustomerId}
        onClose={() => setEditingCustomerId(null)}
        customerId={editingCustomerId}
        onSuccess={() => fetchCustomers(false)}
        isSellerView={isSellerView}
      />

      {/* Modal de confirmación */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !open && setDeleteDialog({ open: false, customer: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar a{" "}
              <strong>{buildFullName(deleteDialog.customer)}</strong>.
              ¿Confirmás que deseas continuar? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CustomersTable;
