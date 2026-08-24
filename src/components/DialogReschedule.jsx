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

const isCancelled = (lead) => lead?.status === "cancelado";

export default function DialogReschedule({ open, onClose, lead, onSaved }) {
  const [date, setDate] = useState(null);
  const [hour, setHour] = useState("15:00");
  const [saving, setSaving] = useState(false);

  const cancelled = isCancelled(lead);

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

      if (cancelled) {
        const appointmentDate = new Date(iso);
        const reservationExpires = new Date(
          appointmentDate.getFullYear(),
          appointmentDate.getMonth(),
          appointmentDate.getDate() + 1,
          0, 0, 0, 0
        );
        reservationExpires.setHours(reservationExpires.getHours() + 3);

        const newLead = {
          referred_by: lead.seller?.id_auth || null,
          customer_id: lead.customers?.id || null,
          interested_variants: lead.interested_variants || [],
          appointment_datetime: iso,
          notes: lead.notes || null,
          status: "pendiente",
          product_status: "en espera",
          fulfillment_type: lead.fulfillment_type || "stock",
          reservation_expires_at: lead.fulfillment_type === "stock" ? reservationExpires.toISOString() : null,
          deposit_paid: false,
          deposit_amount: 0,
          deposit_currency: "ARS",
        };

        const { error } = await supabase.from("leads").insert([newLead]);
        if (error) throw error;

        toast.success("Nuevo pedido creado", {
          description: "Se creó un nuevo pedido con los mismos datos del cancelado.",
        });
      } else {
        const { data, error } = await supabase.rpc("reschedule_order_appointment", {
          p_lead_id: lead.id,
          p_new_appointment: iso,
        });

        if (error) throw error;

        if (data?.has_active_reservation === false) {
          toast.success("Cita reprogramada", {
            description:
              "El pedido no tiene reserva activa. Reservá el producto nuevamente si hace falta.",
          });
        } else {
          toast.success("Cita reprogramada");
        }
      }

      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(cancelled ? "No se pudo crear el pedido" : "No se pudo reprogramar", {
        description: e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{cancelled ? "Crear nuevo pedido" : "Reprogramar cita"}</DialogTitle>
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
            {cancelled
              ? "Se creará un nuevo pedido con los mismos datos del cancelado."
              : "Al guardar se marcará como pendiente."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !date || !hour}>
            {saving
              ? (cancelled ? "Creando..." : "Guardando...")
              : (cancelled ? "Crear pedido" : "Guardar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
