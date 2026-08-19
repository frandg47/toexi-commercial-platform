import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
// ? AGREGADO: Sonner para notificaciones
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ConcentricLoader from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCreditCard,
  IconPlus,
  IconTrash,
  IconEdit,
  IconRefresh,
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
// ? ELIMINADO: import Swal from "sweetalert2";

export default function PaymentMethodsConfig() {
  const [methods, setMethods] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [methodModal, setMethodModal] = useState({
    open: false,
    editId: null,
    name: "",
    percent: 0,
    accreditationDelayBusinessDays: 0,
    accountId: "",
  });
  const [installmentModal, setInstallmentModal] = useState({
    open: false,
    methodId: null,
    editId: null,
    installments: "",
    percent: "",
    description: "",
  });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    methodId: null,
    name: "",
  });

  // ?? Obtener métodos con sus cuotas
  const fetchMethods = async () => {
    setLoading(true);
    let query = supabase
      .from("payment_methods")
      .select(
        "id, name, multiplier, is_active, account_id, accreditation_delay_business_days, payment_installments(id, installments, multiplier, description)"
      )
      .order("id");

    if (statusFilter === "active") {
      query = query.eq("is_active", true);
    } else if (statusFilter === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, error } = await query;

    if (error) {
      // ?? REEMPLAZO 1: Usar toast para error de carga
      toast.error("Error de carga", {
        description: "No se pudieron cargar los métodos de pago.",
      });
    } else {
      setMethods(data || []);
    }
    setLoading(false);
  };

  const fetchAccounts = async () => {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, currency, is_efectivo, is_caja_virtual")
      .order("name", { ascending: true });

    if (error) {
      toast.error("No se pudieron cargar las cuentas", { description: error.message });
      return;
    }
    setAccounts(data || []);
  };

  useEffect(() => {
    fetchMethods();
    fetchAccounts();
  }, [statusFilter]);

  // ?? Guardar o actualizar método
  const handleSaveMethod = async () => {
    const { name, percent, editId, accreditationDelayBusinessDays, accountId } =
      methodModal;
    if (!name) {
      // ?? REEMPLAZO 2: Usar toast para campos requeridos
      toast.warning("Campos requeridos", {
        description: "Completá el nombre del método.",
      });
      return;
    }

    const multiplier = 1 + parseFloat(percent || 0) / 100;
    const payload = {
      name,
      multiplier: parseFloat(multiplier.toFixed(4)),
      accreditation_delay_business_days: Math.max(
        Number(accreditationDelayBusinessDays || 0),
        0
      ),
      account_id: accountId ? Number(accountId) : null,
    };

    let error;
    if (editId) {
      const { error: updateError } = await supabase
        .from("payment_methods")
        .update(payload)
        .eq("id", editId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("payment_methods")
        .insert([payload]);
      error = insertError;
    }

    if (error) {
      // ?? REEMPLAZO 3: Usar toast para error al guardar
      toast.error("Error al guardar", {
        description: "No se pudo guardar el método de pago.",
      });
    } else {
      // ?? REEMPLAZO 4: Usar toast para éxito
      toast.success("Éxito", {
        description: `Método "${name}" ${
          editId ? "actualizado" : "creado"
        } correctamente.`,
      });
      setMethodModal({
        open: false,
        editId: null,
        name: "",
        percent: 0,
        accreditationDelayBusinessDays: 0,
        accountId: "",
      });
      fetchMethods();
    }
  };

  // ?? Desactivar método
  const handleDeleteMethod = async () => {
    if (!deleteDialog.methodId) return;

    const { error } = await supabase
      .from("payment_methods")
      .update({ is_active: false })
      .eq("id", deleteDialog.methodId);

    if (error) {
      // ?? REEMPLAZO 6: Usar toast para error al eliminar
      toast.error("Error al eliminar", {
        description: "No se pudo eliminar el método de pago.",
      });
    } else {
      toast.success("Desactivado", {
        description: `Método "${deleteDialog.name}" desactivado.`,
      });
      fetchMethods();
    }
    setDeleteDialog({ open: false, methodId: null, name: "" });
  };

  // ?? Guardar o actualizar cuota
  const handleSaveInstallment = async () => {
    const { methodId, installments, percent, description, editId } =
      installmentModal;
    if (!installments) {
      // ?? REEMPLAZO 8: Usar toast para campos requeridos
      toast.warning("Campos requeridos", {
        description: "Completá la cantidad de cuotas.",
      });
      return;
    }

    const multiplier = 1 + parseFloat(percent || 0) / 100;
    const payload = {
      payment_method_id: methodId,
      installments: parseInt(installments),
      multiplier: parseFloat(multiplier.toFixed(4)),
      description: description || null,
    };

    let error;
    if (editId) {
      const { error: updateError } = await supabase
        .from("payment_installments")
        .update(payload)
        .eq("id", editId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("payment_installments")
        .insert([payload]);
      error = insertError;
    }

    if (error) {
      // ?? REEMPLAZO 9: Usar toast para error al guardar cuota
      toast.error("Error al guardar", {
        description: "No se pudo guardar la configuración de la cuota.",
      });
    } else {
      // ?? REEMPLAZO 10: Usar toast para éxito
      toast.success("Éxito", {
        description: `Cuota de ${installments} ${
          editId ? "actualizada" : "creada"
        } correctamente.`,
      });
      setInstallmentModal({
        open: false,
        methodId: null,
        editId: null,
        installments: "",
        percent: "",
        description: "",
      });
      fetchMethods();
    }
  };

  // ?? Eliminar cuota
  const handleDeleteInstallment = async (id, installments) => {
    // ?? REEMPLAZO 11: Usar un toast.custom para confirmación o simplificar a una advertencia con un diálogo
    if (
      !window.confirm(
        `¿Estás seguro de que quieres eliminar la cuota de ${installments}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("payment_installments")
      .delete()
      .eq("id", id);

    if (error) {
      // ?? REEMPLAZO 12: Usar toast para error al eliminar cuota
      toast.error("Error al eliminar", {
        description: "No se pudo eliminar la cuota.",
      });
    } else {
      // ?? REEMPLAZO 13: Usar toast para éxito
      toast.success("Eliminada", {
        description: "Cuota eliminada correctamente.",
      });
      fetchMethods();
    }
  };

  return (
    <>
      {/* <SiteHeader titulo="Configuración de Métodos de Pago" /> */}
      <div className="mt-6 flex justify-end items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchMethods}>
          <IconRefresh className="h-4 w-4" /> Refrescar
        </Button>
        <Button
          onClick={() =>
            setMethodModal({
              open: true,
              editId: null,
              name: "",
              percent: 0,
              accreditationDelayBusinessDays: 0,
            })
          }
        >
          <IconPlus className="h-4 w-4" /> Agregar
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {methods.map((method) => (
          <Card
            key={method.id}
            className="shadow-sm hover:shadow-md transition"
          >
            <CardHeader className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-lg">
                <IconCreditCard className="text-purple-600" />
                {method.name}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setMethodModal({
                      open: true,
                      editId: method.id,
                      name: method.name,
                      percent: ((method.multiplier - 1) * 100).toFixed(2),
                      accountId: method.account_id ? String(method.account_id) : "",
                      accreditationDelayBusinessDays:
                        method.accreditation_delay_business_days ?? 0,
                    })
                  }
                >
                  <IconEdit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setDeleteDialog({
                      open: true,
                      methodId: method.id,
                      name: method.name,
                    })
                  }
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Aumento:{" "}
                {method.multiplier >= 1 ? (
                  <b className="text-red-700">
                    +{((method.multiplier - 1) * 100).toFixed(2)}%
                  </b>
                ) : (
                  <b className="text-green-700">
                    {/* Multiplier < 1 means a discount */}-
                    {((1 - method.multiplier) * 100).toFixed(2)}%
                  </b>
                )}
              </p>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Acreditacion:{" "}
                  <b>
                    {Number(method.accreditation_delay_business_days || 0) === 0
                      ? "Inmediata"
                      : `${method.accreditation_delay_business_days} dias habiles`}
                  </b>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Cuenta: <b>{accounts.find((account) => account.id === method.account_id)?.name || "Sin configurar"}</b>
              </p>

              <div className="space-y-2">
                <p className="font-medium">Cuotas:</p>
                {method.payment_installments?.length > 0 ? (
                  method.payment_installments.map((i) => (
                    <div
                      key={i.id}
                      className="flex justify-between items-center text-sm border rounded p-2"
                    >
                      {i.multiplier >= 1 ? (
                        <span>
                          {i.installments} cuotas —
                          <b className="text-red-700 ml-1">
                            +{((i.multiplier - 1) * 100).toFixed(2)}%
                          </b>
                          {i.description && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({i.description})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>
                          {i.installments} cuotas —
                          <b className="text-green-700 ml-1">
                            -{((1 - i.multiplier) * 100).toFixed(2)}%
                          </b>
                        </span>
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setInstallmentModal({
                              open: true,
                              methodId: method.id,
                              editId: i.id,
                              installments: i.installments,
                              percent: ((i.multiplier - 1) * 100).toFixed(2),
                              description: i.description || "",
                            })
                          }
                        >
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleDeleteInstallment(i.id, i.installments)
                          }
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No hay cuotas registradas.
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setInstallmentModal({
                    open: true,
                    methodId: method.id,
                    editId: null,
                    installments: "",
                    percent: "",
                    description: "",
                  })
                }
              >
                <IconPlus className="h-4 w-4 mr-1" /> Agregar cuota
              </Button>
            </CardContent>
          </Card>
        ))}

        {loading && (
          // Mostrar esqueletos si está cargando
          <>
            <Skeleton className="h-[250px] w-full" />
            <Skeleton className="h-[250px] w-full" />
            <Skeleton className="h-[250px] w-full" />
          </>
        )}

        {!methods.length && !loading && (
          <p className="text-sm text-muted-foreground col-span-full text-center py-10">
            No hay métodos de pago registrados.
          </p>
        )}
      </div>

      {/* ?? Modal Método */}
      <Dialog
        open={methodModal.open}
        onOpenChange={() =>
          setMethodModal({
            open: false,
            editId: null,
            name: "",
            percent: 0,
            accreditationDelayBusinessDays: 0,
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
              {methodModal.editId ? "Editar método" : "Nuevo método"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input
                value={methodModal.name}
                onChange={(e) =>
                  setMethodModal((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Porcentaje de aumento (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={methodModal.percent}
                onChange={(e) =>
                  setMethodModal((p) => ({ ...p, percent: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Acreditacion (dias habiles)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={methodModal.accreditationDelayBusinessDays}
                onChange={(e) =>
                  setMethodModal((p) => ({
                    ...p,
                    accreditationDelayBusinessDays: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Usar 0 para acreditacion inmediata y 2 para postnet con demora.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Cuenta de acreditación</Label>
              <Select
                value={methodModal.accountId || "none"}
                onValueChange={(value) =>
                  setMethodModal((p) => ({ ...p, accountId: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin configurar</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La cuenta recibirá el importe neto acreditado de este método.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setMethodModal({
                  open: false,
                  editId: null,
                   name: "",
                   percent: 0,
                   accreditationDelayBusinessDays: 0,
                   accountId: "",
                })
              }
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveMethod}>
              {methodModal.editId ? "Guardar cambios" : "Crear método"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ?? Modal Cuotas */}
      <Dialog
        open={installmentModal.open}
        onOpenChange={() =>
          setInstallmentModal({
            open: false,
            methodId: null,
            editId: null,
            installments: "",
            percent: "",
            description: "",
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
              {installmentModal.editId ? "Editar cuota" : "Nueva cuota"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Cantidad de cuotas</Label>
              <Input
                type="number"
                value={installmentModal.installments}
                onChange={(e) =>
                  setInstallmentModal((p) => ({
                    ...p,
                    installments: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Porcentaje de aumento (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={installmentModal.percent}
                onChange={(e) =>
                  setInstallmentModal((p) => ({
                    ...p,
                    percent: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Descripción (opcional)</Label>
              <Input
                value={installmentModal.description}
                onChange={(e) =>
                  setInstallmentModal((p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setInstallmentModal({
                  open: false,
                  methodId: null,
                  editId: null,
                  installments: "",
                  percent: "",
                  description: "",
                })
              }
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveInstallment}>
              {installmentModal.editId ? "Guardar cambios" : "Crear cuota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !open && setDeleteDialog({ open: false, methodId: null, name: "" })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar método de pago</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por desactivar el método{" "}
              <strong>{deleteDialog.name}</strong>. Las cuotas asociadas
              quedarán inactivas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteMethod}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

