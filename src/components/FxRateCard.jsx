import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconCalendar, IconMessage, IconUser } from "@tabler/icons-react";

const FxRateCard = ({ source, rates }) => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Lunes
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay())); // Domingo
    return d.toISOString().split("T")[0];
  });

  const filteredRates = rates.filter((r) => {
    const date = new Date(r.created_at);
    return (
      date >= new Date(startDate) &&
      date <= new Date(endDate)
    );
  });

  const current = rates.find((r) => r.is_active);

  return (
    <Card className="border border-muted shadow-sm">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          {source.toUpperCase()} <Badge variant="outline">FX</Badge>
        </CardTitle>
        {current && (
          <h2 className="text-2xl font-bold text-green-700">
            ${Number(current.rate).toLocaleString("es-AR")}
          </h2>
        )}
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <IconCalendar size={16} />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-36"
          />
          <span>-</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-36"
          />
          <Button variant="outline" onClick={() => {}}>
            Filtrar
          </Button>
        </div>

        {filteredRates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay registros en este rango.
          </p>
        ) : (
          <div className="divide-y divide-muted/30">
            {filteredRates.map((r) => (
              <div key={r.id} className="py-3">
                <p className="font-medium">
                  ${Number(r.rate).toLocaleString("es-AR")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("es-AR")}
                </p>
                {r.notes && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconMessage size={12} /> {r.notes}
                  </p>
                )}
                {r.created_by && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconUser size={12} /> {r.created_by}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FxRateCard;
