import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useLocation } from "react-router-dom";
import BreadcrumbHeader from "@/components/BreadCrumbHeader.jsx";
import ThemeToggle from "@/components/theme-toggle";


const TITULOS = {
  dashboard: "Dashboard",
  products: "Productos",
  catalog: "Catálogo",
  "catalog/brands": "Marcas",
  "catalog/categories": "Categorías",
  customers: "Clientes",
  team: "Equipo",
  orders: "Pedidos",
  "top-sellers": "Vendedores",

  // ⚙️ Config
  settings: "Configuraciones",
  "settings/comission": "Comisiones",
  "settings/fx-rates": "Tipos de Cambio",
  "settings/payment-methods": "Métodos de Pago",
  "settings/inventory": "Inventario",
  "settings/sales": "Ventas",
  "settings/movements": "Movimientos",
};

export function SiteHeader({ actions }) {
  const location = useLocation();

  // 👉 Tomamos la ruta sin el prefijo /dashboard/ o /seller/
  const path = location.pathname
    .replace("/dashboard/", "")
    .replace("/seller/", "")
    .replace("/", "");

  // 👉 Buscar el título exacto
  const titulo = TITULOS[path] || TITULOS[path.split("/")[0]] || "Panel";

  return (
    <header
      className="
        sticky top-0 z-40 
        flex h-16
        shrink-0 items-center gap-2 border-b 
        bg-green-600/80 md:bg-background/90 dark:bg-background/95 backdrop-blur-sm
        transition-[width,height] ease-linear
      "
    >
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 mb-1">
        <SidebarTrigger className="-ml-1 text-white md:text-foreground" />

        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        <div className="ml-3">
          <BreadcrumbHeader />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {actions}
        </div>
      </div>
    </header>
  );
}
