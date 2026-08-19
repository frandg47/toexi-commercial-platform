import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  IconCurrencyDollar,
  IconSettingsDollar,
  IconCreditCard,
  IconRoute2,
  IconTruck,
  IconReceipt,
  IconBuildingBank,
  IconArrowsExchange,
  IconBrandApple,
  IconCategory2,
  IconFileDollar,
  IconCash,
  IconBox,
} from "@tabler/icons-react";
import CashRegisterHistoryPanel from "@/components/cash-register/CashRegisterHistoryPanel";

const ConfigurationPage = () => {
  const navigate = useNavigate();

  const CARDS_CONFIG = [
    {
      id: "comission",
      label: "Comisiones",
      icon: <IconCurrencyDollar className="h-10 w-10 text-blue-600" />,
      path: "/dashboard/settings/comission",
    },
    {
      id: "fx_rates",
      label: "Cotizaciones",
      icon: <IconSettingsDollar className="h-10 w-10 text-green-600" />,
      path: "/dashboard/settings/fx-rates",
    },
    {
      id: "payment_methods",
      label: "Métodos de pago",
      icon: <IconCreditCard className="h-10 w-10 text-purple-600" />,
      path: "/dashboard/settings/payment-methods",
    },
    {
      id: "sales_channels",
      label: "Canales de venta",
      icon: <IconRoute2 className="h-10 w-10 text-cyan-600" />,
      path: "/dashboard/settings/sales-channels",
    },
    {
      id: "inventory",
      label: "Inventario",
      icon: <IconBox className="h-10 w-10 text-amber-600" />,
      path: "/dashboard/settings/inventory",
    },
    {
      id: "providers",
      label: "Proveedores",
      icon: <IconTruck className="h-10 w-10 text-slate-600" />,
      path: "/dashboard/settings/providers",
    },
    {
      id: "purchases",
      label: "Compras",
      icon: <IconReceipt className="h-10 w-10 text-emerald-600" />,
      path: "/dashboard/settings/purchases",
    },
    {
      id: "accounts",
      label: "Cuentas",
      icon: <IconBuildingBank className="h-10 w-10 text-indigo-600" />,
      path: "/dashboard/settings/accounts",
    },

    {
      id: "budgets",
      label: "Presupuestos",
      icon: <IconFileDollar className="h-10 w-10 text-emerald-600" />,
      path: "/dashboard/payment-calculator",
    },
    {
      id: "seller-payments",
      label: "Pagos a Vendedores",
      icon: <IconCash className="h-10 w-10 text-green-700" />,
      path: "/dashboard/settings/sellers-payments",
    },
    {
      id: "brands",
      label: "Marcas",
      icon: <IconBrandApple className="h-10 w-10 text-zinc-700" />,
      path: "/dashboard/settings/catalog/brands",
    },
    {
      id: "categories",
      label: "Categorías",
      icon: <IconCategory2 className="h-10 w-10 text-slate-700" />,
      path: "/dashboard/settings/catalog/categories",
    },
    {
      id: "historical-cash-register",
      label: "Historial de caja",
      icon: <IconCash className="h-10 w-10 text-orange-600" />,
      path: "/dashboard/settings/historical-cash-register",
    }
  ];

  return (
    <>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {CARDS_CONFIG.map((card) => (
          <Card
            key={card.id}
            onClick={() => {             
              navigate(card.path);
            }}
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                {card.label}
              </CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configurar {card.label.toLowerCase()} del sistema.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      
    </>
  );
};

export default ConfigurationPage;
