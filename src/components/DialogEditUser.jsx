import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FormEditUser from "./FormEditUser";
import { useState, useEffect } from "react";

export default function DialogEditUser({ open, onClose, userId, onSuccess }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setLoading(true);
      // Simular un pequeño delay para mostrar el loader y evitar autofocus
      const timer = setTimeout(() => {
        setLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-lg sm:text-xl font-semibold text-center sm:text-left">
            Editar Usuario
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="text-muted-foreground">Cargando datos...</p>
            </div>
          </div>
        ) : (
          <FormEditUser userId={userId} onClose={onClose} onSuccess={onSuccess} />
        )}
      </DialogContent>
    </Dialog>
  );
}
