import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  IconCurrencyDollar,
  IconSettingsDollar,
  IconCreditCard,
  IconRoute2,
  IconBox,
  IconBuildingBank,
  IconBrandApple,
  IconCategory2,
  IconCash,
  IconCashRegister,
} from "@tabler/icons-react";

const SECTIONS = [
  {
    id: "finanzas",
    label: "Finanzas",
    cards: [
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
        id: "accounts",
        label: "Cuentas",
        icon: <IconBuildingBank className="h-10 w-10 text-indigo-600" />,
        path: "/dashboard/settings/accounts",
      },
    ],
  },
  {
    id: "productos",
    label: "Productos",
    cards: [
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
        id: "inventory",
        label: "Inventario",
        icon: <IconBox className="h-10 w-10 text-amber-600" />,
        path: "/dashboard/settings/inventory",
      },
    ],
  },
  {
    id: "ventas",
    label: "Ventas",
    cards: [
      {
        id: "sales_channels",
        label: "Canales de venta",
        icon: <IconRoute2 className="h-10 w-10 text-cyan-600" />,
        path: "/dashboard/settings/sales-channels",
      },
      {
        id: "reports",
        label: "Reportes",
        icon: <IconCurrencyDollar className="h-10 w-10 text-blue-600" />,
        path: "/dashboard/settings/reports",
      }
    ],
  },
  {
    id: "historial",
    label: "Historial",
    cards: [
      {
        id: "historical-cash-register",
        label: "Historial de caja",
        icon: <IconCashRegister className="h-10 w-10 text-orange-600" />,
        path: "/dashboard/settings/historical-cash-register",
      },
      {
        id: "movements",
        label: "Historial de movimientos",
        icon: <IconCash className="h-10 w-10 text-green-600" />,
        path: "/dashboard/settings/movements",
      }
    ],
  },
];

const ConfigurationPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mt-8 space-y-8">
      {SECTIONS.map((section) => (
        <div key={section.id}>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {section.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {section.cards.map((card) => (
              <Card
                key={card.id}
                onClick={() => navigate(card.path)}
                className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base font-medium">
                    {card.label}
                  </CardTitle>
                  {card.icon}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Configurar {card.label.toLowerCase()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConfigurationPage;
