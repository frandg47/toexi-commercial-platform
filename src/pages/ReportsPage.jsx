import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import FinanceReport from "@/components/reports/FinanceReport";
import InventoryReport from "@/components/reports/InventoryReport";
import SalesAnalysisReport from "@/components/reports/SalesAnalysisReport";
import generateReportPDF from "@/utils/generateReportPDF";
import { IconChartBar, IconPackage, IconTrendingUp, IconDownload } from "@tabler/icons-react";
import { toast } from "sonner";

export default function ReportsPage() {
  const [tab, setTab] = useState("finanzas");
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      await generateReportPDF({ year: new Date().getFullYear() });
      toast.success("PDF generado correctamente");
    } catch (err) {
      console.error("Error generando PDF:", err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="finanzas" className="gap-2">
              <IconChartBar className="h-4 w-4" />
              Finanzas
            </TabsTrigger>
            <TabsTrigger value="inventario" className="gap-2">
              <IconPackage className="h-4 w-4" />
              Inventario
            </TabsTrigger>
            <TabsTrigger value="ventas" className="gap-2">
              <IconTrendingUp className="h-4 w-4" />
              Análisis de ventas
            </TabsTrigger>
          </TabsList>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportPDF}
            disabled={exporting}
          >
            {exporting ? (
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            ) : (
              <IconDownload className="h-4 w-4" />
            )}
            {exporting ? "Generando..." : "Exportar PDF"}
          </Button>
        </div>

        <TabsContent value="finanzas">
          <FinanceReport />
        </TabsContent>

        <TabsContent value="inventario">
          <InventoryReport />
        </TabsContent>

        <TabsContent value="ventas">
          <SalesAnalysisReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
