import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export default function DialogCatalog({
  open,
  onClose,
  onConfirm,
  label = "Nombre",
  initialValue = "",
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);

  const handleSave = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {/* <DialogDescription>
              Ingrese una nueva {label.toLowerCase()} para agregarlo al catálogo.
            </DialogDescription> */}
        <Input
          placeholder={`Nombre de ${label.toLowerCase()}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
