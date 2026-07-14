import { useState } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/app-sidebar";
import { Outlet, useLocation } from "react-router-dom";
import { SiteHeader } from "@/components/site-header";

import {
  IconDashboard,
  IconShoppingCart,
  IconUsers,
  IconSettings,
  IconMedal,
  IconUsersGroup,
  IconReport,
  IconCash,
  IconCalculator,
  IconChartBar,
  IconReceipt,
  IconBuildingBank,
  IconTool,
} from "@tabler/icons-react";

import SheetNewSale from "@/components/SheetNewSale";
import SheetNewLead from "@/components/SheetNewLead";
import { useAuth } from "@/context/AuthContextProvider";

const navMainBase = [
  { title: "Panel principal", url: "/dashboard", icon: IconDashboard },
  { title: "Productos", url: "/dashboard/products", icon: IconReport },
  { title: "Pedidos", url: "/dashboard/orders", icon: IconShoppingCart },
  { title: "Ventas", url: "/dashboard/sales", icon: IconChartBar },
  { title: "Clientes", url: "/dashboard/customers", icon: IconUsers },
  { title: "Equipo", url: "/dashboard/team", icon: IconUsersGroup },
  { title: "Top Vendedores", url: "/dashboard/top-sellers", icon: IconMedal },
  { title: "Cotizador", url: "/dashboard/quick-payment-calculator", icon: IconCalculator },
  { title: "Gastos", url: "/dashboard/expenses", icon: IconReceipt },
  { title: "Postventa", url: "/dashboard/after-sales", icon: IconTool },
  { title: "Finanzas", url: "/dashboard/finance", icon: IconBuildingBank },
  { title: "Movimientos", url: "/dashboard/movements", icon: IconCash },
  // { title: "Reportes", url: "/dashboard/reports", icon: IconChartBar },
];

const navSecondary = [
  { title: "Configuraciones", url: "/dashboard/settings", icon: IconSettings },
];

export default function DashboardLayout() {
  const [saleOpen, setSaleOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const location = useLocation();
  const { user, role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";

  const pageTitles = {
    "/dashboard": "Panel principal",
    "/dashboard/products": "Productos",
    "/dashboard/catalog/brands": "Marcas",
    "/dashboard/catalog/categories": "Categorias",
    "/dashboard/orders": "Pedidos",
    "/dashboard/customers": "Clientes",
    "/dashboard/team": "Equipo",
    "/dashboard/top-sellers": "Top Vendedores",
    "/dashboard/settings": "Configuracion",
    "/dashboard/settings/sellers-payments": "Pagos a Vendedores",
    "/dashboard/settings/comission": "Comisiones",
    "/dashboard/settings/fx-rates": "Cotizaciones",
    "/dashboard/sales": "Ventas",
    "/dashboard/payment-calculator": "Presupuestos",
    "/dashboard/expenses": "Gastos",
    "/dashboard/after-sales": "Postventa",
    "/dashboard/finance": "Finanzas",
    "/dashboard/movements": "Movimientos",
    // "/dashboard/reports": "Reportes",
    "/dashboard/settings/expenses": "Gastos",
    "/dashboard/settings/movements": "Movimientos",
  };

  const navMain = navMainBase.filter((item) => {
    if (item.url === "/dashboard/finance") return isOwner;
    if (item.url === "/dashboard/movements") return isOwner;
    return true;
  });
  const tituloActual = pageTitles[location.pathname] || "Dashboard";

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        title="Toexi Tech"
        navMain={navMain}
        navSecondary={navSecondary}
        actionButtons={[
          { label: "Nuevo pedido", onClick: () => setLeadOpen(true) },
          { label: "Nueva venta", onClick: () => setSaleOpen(true) },
        ]}
      />

      <SidebarInset>
        <SiteHeader titulo={tituloActual} />

        <main className="p-6 w-full mx-auto pt-[var(--header-height)]">
          <Outlet />
        </main>
      </SidebarInset>

      <SheetNewSale open={saleOpen} onOpenChange={setSaleOpen} lead={null} />
      <SheetNewLead
        open={leadOpen}
        onOpenChange={setLeadOpen}
        sellerId={user?.id}
      />
    </SidebarProvider>
  );
}
