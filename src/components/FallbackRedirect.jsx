import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContextProvider";
import ConcentricLoader from "@/components/ui/loading";

export default function FallbackRedirect() {
  const { user, role, status } = useAuth();

  // Mientras se carga la sesión o el rol
  if (status === "loading") {
    return (
      <div className="flex min-h-[100svh] w-full items-center justify-center">
        <ConcentricLoader />
      </div>
    );
  }

  // Si no hay sesión activa → al login
  if (!user) return <Navigate to="/login" replace />;

  // Si hay sesión y rol, redirige según corresponda
  const normalizedRole = role?.toLowerCase();

  if (normalizedRole === "superadmin" || normalizedRole === "owner")
    return <Navigate to="/dashboard" replace />;

  if (normalizedRole === "seller")
    return <Navigate to="/seller/products" replace />;

  // Caso por defecto (usuario sin rol válido)
  return <Navigate to="/unauthorized" replace />;
}
