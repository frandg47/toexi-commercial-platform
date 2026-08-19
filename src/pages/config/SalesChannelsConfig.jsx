import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IconRoute2,
  IconPlus,
  IconTrash,
  IconEdit,
  IconRefresh,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

export default function SalesChannelsConfig() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channelModal, setChannelModal] = useState({
    open: false,
    editId: null,
    name: "",
    description: "",
    is_active: true,
  });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: null, // "delete" | "toggle"
    channelId: null,
    channelName: "",
    currentStatus: null,
  });

  // 🔹 Obtener canales
  const fetchChannels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_channels")
      .select("id, name, description, is_active, created_at")
      .order("name", { ascending: true });

    if (error) {
      toast.error("Error de carga", {
        description: "No se pudieron cargar los canales de venta.",
      });
    } else {
      setChannels(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  // 🔹 Guardar o actualizar canal
  const handleSaveChannel = async () => {
    const { name, description, is_active, editId } = channelModal;
    if (!name.trim()) {
      toast.warning("Campos requeridos", {
        description: "Completá el nombre del canal.",
      });
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      is_active,
    };

    let error;
    if (editId) {
      const { error: updateError } = await supabase
        .from("sales_channels")
        .update(payload)
        .eq("id", editId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("sales_channels")
        .insert([payload]);
      error = insertError;
    }

    if (error) {
      toast.error("Error al guardar", {
        description: error.message || "No se pudo guardar el canal.",
      });
    } else {
      toast.success("Éxito", {
        description: `Canal "${name}" ${
          editId ? "actualizado" : "creado"
        } correctamente.`,
      });
      setChannelModal({
        open: false,
        editId: null,
        name: "",
        description: "",
        is_active: true,
      });
      fetchChannels();
    }
  };

  // 🔹 Eliminar canal
  const handleDeleteChannel = async (id, name) => {
    setConfirmDialog({
      open: true,
      action: "delete",
      channelId: id,
      channelName: name,
      currentStatus: null,
    });
  };

  // 🔹 Confirmar eliminación
  const confirmDelete = async () => {
    const { error } = await supabase
      .from("sales_channels")
      .delete()
      .eq("id", confirmDialog.channelId);

    if (error) {
      toast.error("Error al eliminar", {
        description: "No se pudo eliminar el canal.",
      });
    } else {
      toast.success("Eliminado", {
        description: `Canal "${confirmDialog.channelName}" eliminado correctamente.`,
      });
      fetchChannels();
    }
    setConfirmDialog({
      open: false,
      action: null,
      channelId: null,
      channelName: "",
      currentStatus: null,
    });
  };

  // 🔹 Cambiar estado activo/inactivo
  const handleToggleActive = async (id, currentStatus, name) => {
    setConfirmDialog({
      open: true,
      action: "toggle",
      channelId: id,
      channelName: name,
      currentStatus,
    });
  };

  // 🔹 Confirmar cambio de estado
  const confirmToggle = async () => {
    const { error } = await supabase
      .from("sales_channels")
      .update({ is_active: !confirmDialog.currentStatus })
      .eq("id", confirmDialog.channelId);

    if (error) {
      toast.error("Error al actualizar", {
        description: "No se pudo cambiar el estado del canal.",
      });
    } else {
      toast.success("Actualizado", {
        description: `Canal "${confirmDialog.channelName}" ${
          !confirmDialog.currentStatus ? "activado" : "desactivado"
        }.`,
      });
      fetchChannels();
    }
    setConfirmDialog({
      open: false,
      action: null,
      channelId: null,
      channelName: "",
      currentStatus: null,
    });
  };

  return (
    <>
      <div className="mt-6 flex justify-end items-center gap-3">
        <Button variant="outline" onClick={fetchChannels}>
          <IconRefresh className="h-4 w-4" /> Refrescar
        </Button>
        <Button
          onClick={() =>
            setChannelModal({
              open: true,
              editId: null,
              name: "",
              description: "",
              is_active: true,
            })
          }
        >
          <IconPlus className="h-4 w-4" /> Agregar canal
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => (
          <Card
            key={channel.id}
            className={`shadow-sm hover:shadow-md transition ${
              !channel.is_active ? "opacity-60" : ""
            }`}
          >
            <CardHeader className="flex justify-between items-start">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <IconRoute2 className="text-cyan-600" />
                  {channel.name}
                </CardTitle>
                {channel.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {channel.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={channel.is_active ? "outline" : "secondary"}
                  onClick={() =>
                    handleToggleActive(
                      channel.id,
                      channel.is_active,
                      channel.name
                    )
                  }
                  title={
                    channel.is_active ? "Desactivar" : "Activar"
                  }
                >
                  {channel.is_active ? (
                    <IconCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <IconX className="h-4 w-4 text-red-600" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setChannelModal({
                      open: true,
                      editId: channel.id,
                      name: channel.name,
                      description: channel.description || "",
                      is_active: channel.is_active,
                    })
                  }
                >
                  <IconEdit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    handleDeleteChannel(channel.id, channel.name)
                  }
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Estado: {channel.is_active ? "Activo" : "Inactivo"}
                </span>
                {channel.created_at && (
                  <span>
                    Creado:{" "}
                    {new Date(channel.created_at).toLocaleDateString(
                      "es-AR"
                    )}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {loading && (
          <>
            <Skeleton className="h-[180px] w-full" />
            <Skeleton className="h-[180px] w-full" />
            <Skeleton className="h-[180px] w-full" />
          </>
        )}

        {!channels.length && !loading && (
          <p className="text-sm text-muted-foreground col-span-full text-center py-10">
            No hay canales de venta registrados.
          </p>
        )}
      </div>

      {/* 🛣️ Modal Canal */}
      <Dialog
        open={channelModal.open}
        onOpenChange={() =>
          setChannelModal({
            open: false,
            editId: null,
            name: "",
            description: "",
            is_active: true,
          })
        }
      >
        <DialogContent
          className="
      w-[90vw] max-w-md sm:w-full 
      rounded-lg sm:rounded-xl
      p-4 sm:p-6
      max-h-[90vh] overflow-y-auto
    "
        >
          <DialogHeader>
            <DialogTitle>
              {channelModal.editId ? "Editar canal" : "Nuevo canal"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Nombre del canal</Label>
              <Input
                placeholder="Ej: Mercado Libre, Instagram, Local..."
                value={channelModal.name}
                onChange={(e) =>
                  setChannelModal((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Descripción (opcional)</Label>
              <Textarea
                placeholder="Ej: Ventas realizadas a través de Instagram..."
                value={channelModal.description}
                onChange={(e) =>
                  setChannelModal((p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={channelModal.is_active}
                onChange={(e) =>
                  setChannelModal((p) => ({
                    ...p,
                    is_active: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Activo
              </Label>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setChannelModal({
                  open: false,
                  editId: null,
                  name: "",
                  description: "",
                  is_active: true,
                })
              }
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveChannel}>
              {channelModal.editId ? "Guardar cambios" : "Crear canal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🔐 Dialog Confirmación */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({
              open: false,
              action: null,
              channelId: null,
              channelName: "",
              currentStatus: null,
            });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === "delete"
                ? "Eliminar canal"
                : "Cambiar estado"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "delete"
                ? `¿Estás seguro de que quieres eliminar el canal "${confirmDialog.channelName}"? Esta acción no se puede deshacer.`
                : `¿Estás seguro de que quieres ${
                    confirmDialog.currentStatus ? "desactivar" : "activar"
                  } el canal "${confirmDialog.channelName}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={
                confirmDialog.action === "delete"
                  ? confirmDelete
                  : confirmToggle
              }
              className={
                confirmDialog.action === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmDialog.action === "delete" ? "Eliminar" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
