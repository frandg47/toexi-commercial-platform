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
  IconReport,
  IconCash,
  IconCalculator,
  IconChartBar,
  IconReceipt,
  IconBuildingBank,
  IconTool,
  IconArrowsExchange,
  IconUserDollar,
  IconShoppingBag,
  IconFileDollar,
  IconTruck,
  IconUsersGroup,
  IconUserPlus,
} from "@tabler/icons-react";

import SheetNewSale from "@/components/SheetNewSale";
import SheetNewLead from "@/components/SheetNewLead";
import SheetCanje from "@/components/SheetCanje";
import { useAuth } from "@/context/AuthContextProvider";
import { useCashRegister } from "@/hooks/useCashRegister";

const navMainBase = [
  {
    groupLabel: "Principal",
    items: [
      { title: "Panel principal", url: "/dashboard", icon: IconDashboard },
      { title: "Productos", url: "/dashboard/products", icon: IconReport },
      { title: "Pedidos", url: "/dashboard/orders", icon: IconShoppingCart },
      { title: "Ventas", url: "/dashboard/sales", icon: IconChartBar },
    ],
  },
  {
    groupLabel: "Contactos",
    items: [
      {title: "Equipo", url: "/dashboard/team", icon: IconUsersGroup },
      { title: "Clientes", url: "/dashboard/customers", icon: IconUserPlus },
      { title: "Vendedores", url: "/dashboard/top-sellers", icon: IconUserDollar },
      { title: "Proveedores", url: "/dashboard/providers", icon: IconTruck },
    ],
  },
  {
    groupLabel: "Calculadora",
    items: [
      { title: "Cotizador", url: "/dashboard/quick-payment-calculator", icon: IconCalculator },
      { title: "Presupuestos", url: "/dashboard/payment-calculator", icon: IconFileDollar },
    ],
  },
  {
    groupLabel: "Operaciones",
    items: [
      { title: "Caja", url: "/dashboard/cash-register", icon: IconCash, external: true },
      { title: "Compras", url: "/dashboard/purchases", icon: IconShoppingBag },
      { title: "Postventa", url: "/dashboard/after-sales", icon: IconTool },
    ],
  },
  {
    groupLabel: "Administración",
    items: [
      { title: "Finanzas", url: "/dashboard/finance", icon: IconBuildingBank },
      { title: "Pagos", url: "/dashboard/sellers-payments", icon: IconCash },
      { title: "Gastos", url: "/dashboard/expenses", icon: IconReceipt },
    ],
  },
];

const navSecondary = [
  { title: "Configuraciones", url: "/dashboard/settings", icon: IconSettings },
];

export default function DashboardLayout() {
  const [saleOpen, setSaleOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [canjeOpen, setCanjeOpen] = useState(false);
  const location = useLocation();
  const { user, role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";
  const { loadPendingSales } = useCashRegister(user?.id);

  const pageTitles = {
    "/dashboard": "Panel principal",
    "/dashboard/products": "Productos",
    "/dashboard/catalog/brands": "Marcas",
    "/dashboard/catalog/categories": "Categorias",
    "/dashboard/orders": "Pedidos",
    "/dashboard/customers": "Clientes",
    "/dashboard/team": "Equipo",
    "/dashboard/top-sellers": "Vendedores",
    "/dashboard/settings": "Configuracion",
    "/dashboard/sellers-payments": "Pagos a Vendedores",
    "/dashboard/comission": "Comisiones",
    "/dashboard/fx-rates": "Cotizaciones",
    "/dashboard/sales": "Ventas",
    "/dashboard/payment-calculator": "Presupuestos",
    "/dashboard/expenses": "Gastos",
    "/dashboard/after-sales": "Postventa",
    "/dashboard/finance": "Finanzas",
    "/dashboard/movements": "Movimientos",
  };

  const navMain = navMainBase.filter((item) => {
    if (item.groupLabel === "Administración" && !isOwner) return false;
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
          { label: "Plan canje", onClick: () => setCanjeOpen(true), icon: IconArrowsExchange, badge: "nuevo" },
        ]}
      />

      <SidebarInset>
        <SiteHeader titulo={tituloActual} />

        <main className="p-6 w-full mx-auto pt-[var(--header-height)]">
          <Outlet />
        </main>
      </SidebarInset>

      <SheetNewSale open={saleOpen} onOpenChange={setSaleOpen} lead={null} onSaleCreated={loadPendingSales} />
      <SheetNewLead
        open={leadOpen}
        onOpenChange={setLeadOpen}
        sellerId={user?.id}
      />
      <SheetCanje
        open={canjeOpen}
        onOpenChange={setCanjeOpen}
        userId={user?.id}
      />
    </SidebarProvider>
  );
}
