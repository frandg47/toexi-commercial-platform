import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export default function DialogReschedule({ open, onClose, lead, onSaved }) {
  const [date, setDate] = useState(null);
  const [hour, setHour] = useState("15:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lead?.appointment_datetime) return;

    const d = new Date(lead.appointment_datetime);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");

    setDate(d);
    setHour(`${hh}:${mm}`);
  }, [lead]);

  const save = async () => {
    try {
      setSaving(true);

      let iso = null;
      if (date && hour) {
        const [hh, mm] = hour.split(":");
        const final = new Date(date);
        final.setHours(Number(hh), Number(mm), 0, 0);
        iso = final.toISOString();
      }

      const { error } = await supabase
        .from("leads")
        .update({
          appointment_datetime: iso,
          status: "pendiente",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (error) throw error;

      toast.success("Cita reprogramada");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error("No se pudo reprogramar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Reprogramar cita</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mt-4 space-y-2">
            <Label>Nueva fecha</Label>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left">
                  {date ? format(date, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  locale={es}
                  className="m-auto"
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Horario</Label>
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar hora" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "09:00", "10:00", "11:00", "12:00",
                  "13:00", "14:00", "15:00", "16:00",
                  "17:00", "18:00", "19:00", "20:00",
                ].map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Al guardar se marcará como <strong>pendiente</strong>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !date || !hour}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
