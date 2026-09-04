import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  IconEdit,
  IconRefresh,
  IconTrash,
  IconUser,
  IconPhone,
  IconMapPin,
} from "@tabler/icons-react";

const ProvidersTable = ({ onAdd }) => {
  const [filter, setFilter] = useState("");
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    provider: null,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    notes: "",
    is_active: true,
  });

  const fetchProviders = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    else setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from("providers")
        .select(
          "id, name, contact_name, phone, email, address, city, notes, is_active, created_at"
        )
        .order("name", { ascending: true });

      if (error) throw error;
      setProviders(data ?? []);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar proveedores", {
        description: error.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders(true);
  }, [fetchProviders]);

  const handleConfirmDelete = useCallback(async () => {
    const p = deleteDialog.provider;
    if (!p) return;
    try {
      setRefreshing(true);
      const { error } = await supabase.from("providers").delete().eq("id", p.id);
      if (error) throw error;
      toast.success("Proveedor eliminado", {
        description: `${p.name} fue eliminado correctamente.`,
      });
      await fetchProviders();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar el proveedor", {
        description: error.message,
      });
    } finally {
      setRefreshing(false);
      setDeleteDialog({ open: false, provider: null });
    }
  }, [fetchProviders, deleteDialog.provider]);

  const handleOpenEdit = (provider) => {
    if (!provider) return;
    setEditForm({
      id: provider.id,
      name: provider.name || "",
      contact_name: provider.contact_name || "",
      phone: provider.phone || "",
      email: provider.email || "",
      address: provider.address || "",
      city: provider.city || "",
      notes: provider.notes || "",
      is_active: !!provider.is_active,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.id) return;
    if (!editForm.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    try {
      setRefreshing(true);
      const payload = {
        name: editForm.name.trim(),
        contact_name: editForm.contact_name?.trim() || null,
        phone: editForm.phone?.trim() || null,
        email: editForm.email?.trim() || null,
        address: editForm.address?.trim() || null,
        city: editForm.city?.trim() || null,
        notes: editForm.notes?.trim() || null,
        is_active: editForm.is_active,
      };

      const { error } = await supabase
        .from("providers")
        .update(payload)
        .eq("id", editForm.id);

      if (error) throw error;

      toast.success("Proveedor actualizado");
      setEditDialogOpen(false);
      await fetchProviders(false);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar el proveedor", {
        description: error.message,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = providers.filter((p) =>
    `${p.name || ""} ${p.contact_name || ""}`
      .toLowerCase()
      .includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Buscar proveedor..."
          onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:w-80"
        />

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => fetchProviders(false)}
            disabled={refreshing}
          >
            <IconRefresh className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Actualizar
          </Button>
          {onAdd}
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Ubicacion</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Cargando proveedores...
                </TableCell>
              </TableRow>
            )}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay proveedores registrados.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name || "Sin nombre"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                        <IconUser className="h-4 w-4 text-muted-foreground" />
                        {p.contact_name || "Sin contacto"}
                      </div>
                      <div className="flex items-center gap-2">
                        <IconPhone className="h-4 w-4 text-muted-foreground" />
                        {p.phone || p.email || "-"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <IconMapPin className="h-4 w-4 text-muted-foreground" />
                      {p.city || p.address || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                    {p.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.is_active ? (
                      <Badge variant="success" className="bg-green-500 text-white">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(p)}
                      >
                        <IconEdit className="h-4 w-4" />
                      </Button>
                      {/* <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setDeleteDialog({ open: true, provider: p })
                        }
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button> */}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !open && setDeleteDialog({ open: false, provider: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar proveedor</AlertDialogTitle>
            <AlertDialogDescription>
              Estas por eliminar a{" "}
              <strong>{deleteDialog.provider?.name}</strong>. Esta accion no se puede deshacer.
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Editar proveedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Nombre</span>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Contacto</span>
              <Input
                value={editForm.contact_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, contact_name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Telefono</span>
              <Input
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Email</span>
              <Input
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Direccion</span>
              <Input
                value={editForm.address}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Ciudad</span>
              <Input
                value={editForm.city}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, city: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">Notas</span>
              <Textarea
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <Switch
                checked={editForm.is_active}
                onCheckedChange={(checked) =>
                  setEditForm((f) => ({ ...f, is_active: checked }))
                }
              />
              <span className="text-sm">Activo</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={refreshing}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProvidersTable;
