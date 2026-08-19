// src/components/FormEditUser.jsx
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2Icon } from "lucide-react";
import { useAuth } from "../context/AuthContextProvider"

export default function FormEditUser({ userId, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const { role } = useAuth();
  const normalizedRole = role?.toLowerCase();
  const isOwner = normalizedRole === "owner";
  const canManageActive =
    normalizedRole === "superadmin" || normalizedRole === "owner";
  const [user, setUser] = useState({
    name: "",
    last_name: "",
    dni: "",
    email: "",
    phone: "",
    adress: "", // Nota: está como "adress" en la BD
    role: "",
    is_active: false,
  });

  useEffect(() => {
    const fetchUser = async () => {
      if (!userId) return;

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        toast.error("Error al cargar el usuario");
        return;
      }

      setUser(data);
    };

    fetchUser();
  }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!user.dni || !user.name || !user.last_name) {
        throw new Error("Los campos DNI, Nombre y Apellido son obligatorios");
      }

      if (isOwner) {
        // Owner: update normal (incluye role)
        const { error } = await supabase
          .from("users")
          .update({
            name: user.name,
            last_name: user.last_name,
            dni: user.dni,
            phone: user.phone,
            role: user.role,
            adress: user.adress,
            is_active: user.is_active,
          })
          .eq("id", userId);

        if (error) throw error;
      } else if (normalizedRole === "superadmin") {
        // Superadmin: RPC sin role
        const { error } = await supabase.rpc("superadmin_update_user_profile", {
          p_id_auth: user.id_auth,           // <- importantísimo
          p_is_active: user.is_active,
          p_name: user.name,
          p_last_name: user.last_name,
          p_dni: user.dni,
          p_phone: user.phone,
          p_adress: user.adress,
          // p_email no hace falta (está disabled)
          // p_avatar_url si lo manejás
        });

        if (error) throw error;
      } else {
        throw new Error("No autorizado");
      }

      toast.success("Usuario actualizado correctamente");
      if (onSuccess) await onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.message || "Error al actualizar el usuario");
    } finally {
      setLoading(false);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            value={user.name || ""}
            onChange={(e) => setUser({ ...user, name: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="last_name">Apellido</Label>
          <Input
            id="last_name"
            value={user.last_name || ""}
            onChange={(e) => setUser({ ...user, last_name: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dni">DNI</Label>
          <Input
            id="dni"
            value={user.dni || ""}
            onChange={(e) => setUser({ ...user, dni: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={user.email || ""}
            disabled
            className="bg-gray-100"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            value={user.phone || ""}
            onChange={(e) => setUser({ ...user, phone: e.target.value })}
          />
        </div>

        {isOwner && (
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Select
              value={user.role || ""}
              onValueChange={(value) => setUser({ ...user, role: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="superadmin">Vendedor</SelectItem>
                <SelectItem value="seller">Integrante</SelectItem>
                <SelectItem value="owner">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="adress">Dirección</Label>
          <Input
            id="adress"
            value={user.adress || ""}
            onChange={(e) => setUser({ ...user, adress: e.target.value })}
          />
        </div>

        {canManageActive && (
          <div className="flex items-center space-x-2 sm:col-span-2">
            <Switch
              id="is_active"
              checked={user.is_active}
              onCheckedChange={(checked) =>
                setUser({ ...user, is_active: checked })
              }
            />
            <Label htmlFor="is_active">Usuario activo</Label>
          </div>
        )}
      </div>
      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
