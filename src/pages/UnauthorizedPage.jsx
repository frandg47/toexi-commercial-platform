import { useNavigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = location.state?.from ?? "/login";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div>
        <h1 className="text-3xl font-semibold">Sin permisos suficientes</h1>
        <p className="mt-2 text-muted-foreground">
          Tu cuenta no tiene acceso a este modulo. Si crees que es un error, comunicate con un administrador.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => navigate(-1)}>Volver atras</Button>
        {/* <Button variant="outline" onClick={() => navigate(fromPath, { replace: true })}>
          Ir al inicio
        </Button> */}
      </div>
    </div>
  );
}
