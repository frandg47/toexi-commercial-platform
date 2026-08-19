import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
// ❌ ELIMINADO: import Swal from "sweetalert2";

// ✅ AGREGADO: Sonner para notificaciones
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { registerUser } from "../lib/registerUser";
import { IconPlus } from "@tabler/icons-react";

const schema = yup.object({
  name: yup.string().required("El nombre es obligatorio"),
  lastName: yup.string().required("El apellido es obligatorio"),
  dni: yup.string().required("El DNI es obligatorio"),
  phone: yup.string().required("El telefono es obligatorio"),
  address: yup.string().required("La direccion es obligatoria"),
  email: yup
    .string()
    .email("Email invalido")
    .required("El email es obligatorio"),
  password: yup
    .string()
    .min(6, "La contrasena debe tener al menos 6 caracteres")
    .required("La contrasena es obligatoria"),
  role: yup
    .string()
    .oneOf(["seller", "superadmin", "owner"], "Selecciona un rol valido"),
  state: yup.boolean(),
});

const roleOptions = [
  { value: "seller", label: "Vendedor" },
  { value: "superadmin", label: "Super administrador" },
  { value: "owner", label: "Owner" },
];

const FormRegisterNewUser = ({ onSuccess }) => {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: "",
      lastName: "",
      dni: "",
      phone: "",
      address: "",
      email: "",
      password: "",
      role: "seller",
      state: false,
    },
  });

  const onSubmit = async (data) => {
    // 🔁 Reemplazo del flujo de SweetAlert por toast.promise para manejar el estado
    try {
      await toast.promise(
        registerUser({
          ...data,
          state: Boolean(data.state),
        }),
        {
          loading: "Registrando usuario...",
          success: "Usuario registrado: El usuario fue creado correctamente", // Concatenación de título y texto
          error: (error) => {
            // Usa el mensaje de error de la excepción
            return `Error al registrar usuario: ${error.message || "Ocurrió un error desconocido"}`;
          },
        }
      );

      // Solo si la promesa es exitosa:
      reset();
      onSuccess?.();
    } catch (error) {
      // El error ya fue manejado y mostrado por toast.promise.
      // Mantenemos el console.error para el debugging.
      console.error(error);
    }

    // ❌ ELIMINADO: La lógica de éxito y error con Swal
    /*
    try {
      await registerUser({ ...data, state: Boolean(data.state) });
      Swal.fire({
        icon: "success",
        title: "Usuario registrado",
        text: "El usuario fue creado correctamente",
      });
      reset();
      onSuccess?.();
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error al registrar usuario",
        text: error.message,
      });
    }
    */
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">
          <IconPlus className="h-4 w-4" />
          Agregar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl w-[90vw] max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo integrante</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: "name", label: "Nombre" },
              { id: "lastName", label: "Apellido" },
              { id: "dni", label: "DNI" },
              { id: "phone", label: "Telefono" },
              { id: "address", label: "Direccion", fullWidth: true },
              { id: "email", label: "Email", type: "email", fullWidth: true },
              {
                id: "password",
                label: "Contraseña",
                type: "password",
                fullWidth: true,
              },
            ].map((field) => (
              <div
                key={field.id}
                className={`grid gap-2 ${
                  field.fullWidth ? "md:col-span-2" : ""
                }`}
              >
                <Label htmlFor={field.id}>{field.label}</Label>
                <Input
                  id={field.id}
                  type={field.type || "text"}
                  {...register(field.id)}
                  className="w-full"
                />
                {errors[field.id] && (
                  <p className="text-sm text-red-500">
                    {errors[field.id].message}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Rol</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && (
                <p className="text-sm text-red-500">{errors.role.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border p-3">
              <div className="flex-1">
                <Label htmlFor="state" className="font-medium mb-2">
                  Cuenta activa
                </Label>
                <p className="text-sm text-muted-foreground">
                  Permite al usuario iniciar sesión de inmediato.
                </p>
              </div>
              <Controller
                name="state"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="state"
                    checked={Boolean(field.value)}
                    onCheckedChange={(value) => field.onChange(Boolean(value))}
                  />
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="mt-4">
              {isSubmitting ? "Registrando..." : "Registrar"}
            </Button>
            <DialogClose asChild>
              <Button variant="outline" className="mt-4">
                Cancelar
              </Button>
            </DialogClose>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FormRegisterNewUser;
