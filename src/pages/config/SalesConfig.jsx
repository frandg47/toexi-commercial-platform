
import { SiteHeader } from "@/components/site-header";
import { SalesList } from "@/components/SalesList";

const SalesConfig = () => {
  return (
    <>
      {/* <SiteHeader titulo="Configuración de Ventas" /> */}
      <div className="@container/main flex flex-1 flex-col gap-4 py-6">
        <SalesList />
      </div>
    </>
  );
};

export default SalesConfig;
