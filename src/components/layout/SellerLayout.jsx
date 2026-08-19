// src/components/layout/SellerLayout.jsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { Outlet, useLocation } from "react-router-dom";
import SheetNewLead from "../SheetNewLead";
import { SiteHeader } from "@/components/site-header";

import PaymentCalculatorDialog from "../PaymentCalculatorDialog";

// import {
//   paymentMethods,
//   getInstallmentsForMethod,
// } from "../../lib/paymentsConfig";

import {
  IconHome,
  IconShoppingCart,
  IconList,
  IconUsers,
  IconMedal,
  IconSettings,
  IconCalculator,
  IconFileDollar,
} from "@tabler/icons-react";

import { toast } from "sonner";
import { useAuth } from "../../context/AuthContextProvider";
// import { url } from "inspector";

const showDevelopmentToast = (feature) =>
  toast.info("Funcionalidad en desarrollo", {
    description: `El módulo de ${feature} estará disponible próximamente.`,
  });

const navSecondary = [
  {
    title: "Configuraciones",
    url: "/seller/settings",
    icon: IconSettings,
    onClick: () => showDevelopmentToast("Configuración"),
  },
];

export default function SellerLayout() {
  // const [openCalculatorDialog, setOpenCalculatorDialog] = useState(false);
  const [openLeadDialog, setOpenLeadDialog] = useState(false);
  const { user } = useAuth();

  const location = useLocation();

  // 🔹 Rutas → Títulos automáticos
  const pageTitles = {
    "/seller/products": "Productos",
    "/seller/sales": "Mis ventas",
    "/seller/orders": "Mis pedidos",
    "/seller/clients": "Clientes",
    "/seller/top-sellers": "Mis ventas",
    "/seller/settings": "Configuraciones",
  };

  const tituloActual = pageTitles[location.pathname] || "Panel del vendedor";

  const navMain = [
    { title: "Inicio", url: "/seller/products", icon: IconHome },
    // {
    //   title: "Mis ventas",
    //   url: "/seller/sales",
    //   icon: IconShoppingCart,
    //   onClick: () => showDevelopmentToast("Mis ventas"),
    // },
    { title: "Mis pedidos", url: "/seller/orders", icon: IconList },
    { title: "Clientes", url: "/seller/customers", icon: IconUsers },
    { title: "Mis ventas", url: "/seller/my-sales", icon: IconMedal },
    {
      title: "Presupuestos",
      icon: IconFileDollar,
      url: "/seller/payment-calculator",
      // onClick: () => setOpenCalculatorDialog(true),
    },
    {
      title: "Cotizador",
      icon: IconCalculator,
      url: "/seller/quick-payment-calculator",
      // onClick: () => setOpenCalculatorDialog(true),
    }
  ];

  return (
    <SidebarProvider>
      <AppSidebar
        title="Toexi Tech"
        navMain={navMain}
        navSecondary={navSecondary}
        actionButtonLabel="Nuevo pedido"
        onActionClick={() => setOpenLeadDialog(true)}
      />

      <SidebarInset>
        <SiteHeader titulo={tituloActual} />

        <main className="p-6 mx-auto max-w-6xl w-full pt-[var(--header-height)]">
          <Outlet />
        </main>
      </SidebarInset>

      <SheetNewLead
        open={openLeadDialog}
        onOpenChange={setOpenLeadDialog}
        sellerId={user?.id}
      />

      {/* <PaymentCalculatorDialog
        open={openCalculatorDialog}
        onOpenChange={setOpenCalculatorDialog}
        paymentMethods={paymentMethods}
        getInstallmentsForMethod={getInstallmentsForMethod}
        initialSubtotalUSD={0}
        initialExchangeRate={1440}
      /> */}
    </SidebarProvider>
  );
}
