import { useCallback, useEffect, useMemo, useState } from "react";
// ❌ ELIMINADO: import Swal from "sweetalert2";
// ✅ AGREGADO: Sonner para notificaciones
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";
import { formatPersonName } from "@/utils/formatName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconColumns } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconRefresh,
  IconTrash,
  IconEdit,
  IconBriefcase,
  IconUserShield,
} from "@tabler/icons-react";
import DialogEditUser from "./DialogEditUser";
import { useAuth } from "../context/AuthContextProvider";
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

const TABLE_COLUMNS = [
  { id: "avatar", label: "Avatar" },
  { id: "name", label: "Nombre" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Teléfono" },
  { id: "role", label: "Rol" },
  { id: "is_active", label: "Activa" },
  { id: "created_at", label: "Creación" },
  { id: "actions", label: "Acciones" },
];

const formatDate = (value) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    console.error(error);
    return value;
  }
};

const buildFullName = (user) => {
  if (!user?.name && !user?.last_name) return "Sin nombre";
  return formatPersonName(user?.name, user?.last_name);
};

const getInitials = (user) => {
  const name = buildFullName(user);
  if (!name || name === "Sin nombre") return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const getGoogleAvatarUrl = (email) => {
  if (!email) return undefined;
  return `https://www.google.com/s2/photos/profile/${encodeURIComponent(
    email
  )}`;
};

const UsersTable = ({ refreshToken = 0 }) => {
  const [visibleColumns, setVisibleColumns] = useState(
    TABLE_COLUMNS.map((col) => col.id)
  );
  const [nameFilter, setNameFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);

  // 🆕 ESTADO: Para manejar el AlertDialog de eliminación
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    user: null,
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilter(nameFilter.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [nameFilter]);

  const fetchUsers = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("users")
        .select(
          "id, id_auth, name, avatar_url, last_name, email, role, is_active, phone, dni, adress, created_at",
          { count: "exact" }
        )
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (debouncedFilter) {
        const term = `%${debouncedFilter}%`;
        query = query.or(
          `name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},dni.ilike.${term}`
        );
      }
      if (statusFilter !== "all") {
        query = query.eq("is_active", statusFilter === "active");
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setUsers(data ?? []);
      setTotalCount(count ?? 0);
    } catch (error) {
      console.error(error);
      // 🔄 REEMPLAZO 1: Usar toast para el error de carga
      toast.error("No se pudieron cargar los usuarios", {
        description: error.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedFilter, page, statusFilter]);

  useEffect(() => {
    fetchUsers(refreshToken === 0);
  }, [fetchUsers, refreshToken]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilter, refreshToken, statusFilter]);

  // const handleToggleActive = useCallback(
  //   async (user) => {
  //     try {
  //       setRefreshing(true);
  //       const { error } = await supabase
  //         .from("users")
  //         .update({ is_active: !user.is_active })
  //         .eq("id", user.id);

  //       if (error) throw error;
  //       await fetchUsers();
  //       // 🔄 REEMPLAZO 2: Usar toast para la confirmación de actualización
  //       toast.success("Estado actualizado", {
  //         description: `La cuenta de ${user.email} ahora está ${!user.is_active ? "activa" : "inactiva"
  //           }.`,
  //       });
  //     } catch (error) {
  //       console.error(error);
  //       // 🔄 REEMPLAZO 3: Usar toast para el error de actualización
  //       toast.error("No se pudo actualizar el estado", {
  //         description: error.message,
  //       });
  //     } finally {
  //       setRefreshing(false);
  //     }
  //   },
  //   [fetchUsers]
  // );


  const { role } = useAuth();
  const normalizedRole = role?.toLowerCase();
  const isOwner = normalizedRole === "owner";
  const isSuperadmin = normalizedRole === "superadmin";

  const handleToggleActive = useCallback(
    async (user) => {
      try {
        setRefreshing(true);

        if (isOwner) {
          const { error } = await supabase
            .from("users")
            .update({ is_active: !user.is_active })
            .eq("id", user.id);

          if (error) throw error;
        } else if (isSuperadmin) {
          const { error } = await supabase.rpc("superadmin_update_user_profile", {
            p_id_auth: user.id_auth,
            p_is_active: !user.is_active,
          });

          if (error) throw error;
        } else {
          throw new Error("No autorizado");
        }

        await fetchUsers();
        toast.success("Estado actualizado", {
          description: `La cuenta de ${user.email} ahora está ${!user.is_active ? "activa" : "inactiva"
            }.`,
        });
      } catch (error) {
        toast.error("No se pudo actualizar el estado", {
          description: error.message,
        });
      } finally {
        setRefreshing(false);
      }
    },
    [fetchUsers, isOwner, isSuperadmin]
  );

  // const fixGoogleAvatar = (url) => {
  //   console.log("url imagen", url);
  //   if (!url) return null;
  //   return url.replace("=s96-c", "=s256-c");
  // };


  // 🆕 FUNCIÓN: Abre el AlertDialog de eliminación
  const handleOpenDeleteDialog = (user) => {
    setDeleteDialog({ open: true, user });
  };

  // 🆕 FUNCIÓN: Ejecuta la eliminación después de la confirmación del AlertDialog
  const handleConfirmDelete = useCallback(async () => {
    const user = deleteDialog.user;
    if (!user) return;

    try {
      setRefreshing(true);
      const { error } = await supabase.from("users").delete().eq("id", user.id);

      if (error) throw error;
      await fetchUsers();
      // 🔄 REEMPLAZO 4: Usar toast para la confirmación de eliminación
      toast.success("Usuario eliminado", {
        description: `${user.email} fue eliminado del sistema.`,
      });
    } catch (error) {
      console.error(error);
      // 🔄 REEMPLAZO 5: Usar toast para el error de eliminación
      toast.error("No se pudo eliminar", {
        description: error.message,
      });
    } finally {
      setRefreshing(false);
      setDeleteDialog({ open: false, user: null });
    }
  }, [fetchUsers, deleteDialog.user]);

  const toggleColumn = useCallback((columnName) => {
    setVisibleColumns((current) =>
      current.includes(columnName)
        ? current.filter((col) => col !== columnName)
        : [...current, columnName]
    );
  }, []);

  const orderedUsers = useMemo(() => {
    return users.slice().sort((a, b) => {
      if (a.is_active === b.is_active) return 0;
      return a.is_active ? -1 : 1;
    });
  }, [users]);

  const isEmpty = useMemo(
    () => !loading && orderedUsers.length === 0,
    [loading, orderedUsers.length]
  );

  const columnCount = visibleColumns.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-4">
      {/* 🔹 Header de filtros y acciones */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

        {/* 🔍 Buscador */}
        <Input
          placeholder="Buscar por nombre..."
          onChange={(e) => setNameFilter(e.target.value)}
          className="w-full lg:w-80 max-w-full"
        />

        {/* 🔘 Botones */}
        <div className="flex flex-wrap gap-2 justify-end w-full lg:w-auto">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value)}
          >
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>

          {/* Columnas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <IconColumns className="h-4 w-4" />
                <span>Columnas</span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-40">
              {TABLE_COLUMNS.map((col) => (
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

          {/* Refrescar */}
          <Button
            variant="outline"
            onClick={() => fetchUsers(false)}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <IconRefresh
              className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Refrescar
          </Button>

        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.includes("avatar") && (
                <TableHead>Avatar</TableHead>
              )}
              {visibleColumns.includes("name") && <TableHead>Nombre</TableHead>}
              {visibleColumns.includes("email") && <TableHead>Email</TableHead>}
              {visibleColumns.includes("phone") && (
                <TableHead>Teléfono</TableHead>
              )}
              {visibleColumns.includes("role") && <TableHead>Rol</TableHead>}
              {visibleColumns.includes("is_active") && (
                <TableHead>Activa</TableHead>
              )}
              {visibleColumns.includes("created_at") && (
                <TableHead>Creada</TableHead>
              )}
              {visibleColumns.includes("actions") && (
                <TableHead className="w-[160px] text-right">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <div className="grid gap-2">
                    {[...Array(10)].map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {isEmpty && (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-10 text-center text-muted-foreground"
                >
                  Todavía no se registraron usuarios.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              orderedUsers.map((user) => (
                <TableRow key={user.id}>
                  {visibleColumns.includes("avatar") && (
                    <TableCell className="w-[70px]">
                      <Avatar className="h-12 w-12">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback>{getInitials(user)}</AvatarFallback>
                        </Avatar>
                      </Avatar>
                    </TableCell>
                  )}
                  {visibleColumns.includes("name") && (
                    <TableCell>
                      <div className="font-medium">{buildFullName(user)}</div>
                      <div className="text-sm text-muted-foreground">
                        DNI: {user.dni || "-"}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.includes("email") && (
                    <TableCell>
                      <div>{user.email}</div>
                      <div className="text-sm text-muted-foreground">
                        {user.adress || "Sin dirección"}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.includes("phone") && (
                    <TableCell>{user.phone || "-"}</TableCell>
                  )}
                  {visibleColumns.includes("role") && (
                    <TableCell>
                      {user.role === "owner" ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-500 text-white dark:bg-amber-600"
                        >
                          <IconUserShield className="h-4 w-4" />
                          Administrador
                        </Badge>
                      ) : user.role === "superadmin" ? (
                        <Badge
                          variant="secondary"
                          className="bg-blue-500 text-white dark:bg-blue-600"
                        >
                          <IconUserShield className="h-4 w-4" />
                          Vendedor
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <IconBriefcase className="h-4 w-4" />
                          Free
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.includes("is_active") && (
                    <TableCell>
                      <Switch
                        checked={Boolean(user.is_active)}
                        onCheckedChange={() => handleToggleActive(user)}
                        aria-label={"Cambiar estado de " + user.email}
                      />
                    </TableCell>
                  )}
                  {visibleColumns.includes("created_at") && (
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                  )}
                  {visibleColumns.includes("actions") && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingUserId(user.id)}
                          disabled={refreshing}
                        >
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        {/* <Button
                          variant="destructive"
                          size="sm"
                          // 🔄 REEMPLAZO 6: Usar la función para abrir el diálogo
                          onClick={() => handleOpenDeleteDialog(user)}
                          disabled={refreshing}
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

        <div className="flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
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

        <DialogEditUser
          open={!!editingUserId}
          onClose={() => setEditingUserId(null)}
          userId={editingUserId}
          onSuccess={() => fetchUsers(false)}
        />

        {/* 🆕 COMPONENTE: AlertDialog para confirmar la eliminación */}
        <AlertDialog
          open={deleteDialog.open}
          onOpenChange={(open) => {
            // Asegura que al cerrar, el usuario se resetee
            if (!open) setDeleteDialog({ open: false, user: null });
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción quitará a **{deleteDialog.user?.email}** del
                listado. ¿Confirmas que deseas continuar? Esta acción no se
                puede deshacer.
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
        {/* FIN AlertDialog */}
      </div>
    </div>
  );
};

export default UsersTable;
