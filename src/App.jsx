import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthContextProvider, useAuth } from "./context/AuthContextProvider";
import { Button } from "@/components/ui/button";

import DashboardLayout from "./components/layout/DashboardLayout";
import SellerLayout from "./components/layout/SellerLayout";

import Dashboard from "./pages/Dashboard";
import FallbackRedirect from "@/components/FallbackRedirect";
import Products from "./pages/Products";
import CatalogPage from "./pages/CatalogPage";
import CustomersPage from "./pages/CustomersPage";
import TeamPage from "./pages/TeamPage";
import LoginPage from "./pages/LoginPage";
import MaintenancePage from "./pages/MaintenancePage";
import OrdersPage from "./pages/OrdersPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import ConcentricLoader from "./components/ui/loading";
import ConfigurationPage from "./pages/ConfigurationPage";
import AuthCallback from "./pages/AuthCallback";
import TopSellersPage from "./pages/TopSellersPage";
import PaymentCalculator from "./pages/PaymentCalculator";
import SellersPayments from "./pages/SellersPayments";
import QuickPaymentCalculator from "./pages/QuickPaymentCalculator";
import ExpensesPage from "./pages/ExpensesPage";
import FinancePage from "./pages/FinancePage";
import ReportsPage from "./pages/ReportsPage";
import AftersalesPage from "./pages/AftersalesPage";

// âš™ï¸ ConfiguraciÃ³n
import ComissionConfig from "./pages/config/ComissionConfig";
import FxRatesConfig from "./pages/config/FxRatesConfig";
import PaymentMethodsConfig from "./pages/config/PaymentMethodsConfig";
import SalesChannelsConfig from "./pages/config/SalesChannelsConfig";
import InventoryConfig from "./pages/config/InventoryConfig";
import SalesConfig from "./pages/config/SalesConfig";
import ProvidersConfig from "./pages/config/ProvidersConfig";
import PurchasesConfig from "./pages/config/PurchasesConfig";
import AccountsConfig from "./pages/config/AccountsConfig";
import MovementsConfig from "./pages/config/MovementsConfig";

import InstallPromptBanner from "./components/InstallPromptBanner";
import IOSInstallBanner from "@/components/IOSInstallBanner";

const MAINTENANCE_MODE = false;

// ðŸ”’ COMPONENTE DE RUTA PROTEGIDA
function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();
  const { user, role, isActive, status, error, refreshProfile } = useAuth();

  // ðŸ” Mostrar loader solo mientras se verifica sesiÃ³n por primera vez
  if (status === "loading") {
    return (
      <div className="flex min-h-[100svh] w-full items-center justify-center">
        <ConcentricLoader />
      </div>
    );
  }

  if (status === "backend-unavailable") {
    return (
      <div className="flex min-h-[100svh] w-full items-center justify-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border bg-background p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Servicio temporalmente inestable</h2>
          <p className="text-sm text-muted-foreground">
            {error ||
              "Estamos teniendo problemas de conectividad con el servidor. Por favor, intenta nuevamente en unos minutos."}
          </p>
          <Button onClick={refreshProfile}>Reintentar</Button>
        </div>
      </div>
    );
  }

  // ðŸ” Si no hay usuario autenticado (una vez que terminÃ³ de cargar)
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ðŸš« Si el usuario estÃ¡ deshabilitado
  if (!isActive) {
    return <Navigate to="/login?disabled=1" replace />;
  }

  // ðŸŽ­ Normalizar rol
  const normalizedRole = role?.toLowerCase();

  // ðŸš· Si el rol no tiene permiso
  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(normalizedRole)
  ) {
    // Si es vendedor e intenta entrar al dashboard â†’ redirigir a su panel
    if (normalizedRole === "seller") {
      return <Navigate to="/seller/products" replace />;
    }

    // Caso contrario â†’ pÃ¡gina de no autorizado
    return <Navigate to="/unauthorized" replace />;
  }

  // âœ… Si todo estÃ¡ bien, renderizar el contenido
  return children;
}

// ðŸ§­ APP PRINCIPAL
export default function App() {
  if (MAINTENANCE_MODE) {
    return (
      <>
        <Toaster position="top-center" />
        <MaintenancePage />
      </>
    );
  }

  return (
    <>
      <InstallPromptBanner />
      <IOSInstallBanner />
      <Toaster position="top-center" />
      <AuthContextProvider>
        <Routes>
          {/* ðŸ”“ PÃGINAS PÃšBLICAS */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* ðŸ§­ DASHBOARD (solo superadmin/owner) */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "owner"]}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            {/* ðŸ§© RUTAS INTERNAS DEL DASHBOARD */}
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="settings/catalog/brands" element={<CatalogPage />} />
            <Route path="settings/catalog/categories" element={<CatalogPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="top-sellers" element={<TopSellersPage />} />
            <Route path="settings/sellers-payments" element={<SellersPayments />} />
            <Route path="payment-calculator" element={<PaymentCalculator />} />
            <Route
              path="quick-payment-calculator"
              element={<QuickPaymentCalculator />}
            />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="after-sales" element={<AftersalesPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings/expenses" element={<ExpensesPage />} />

            {/* âš™ï¸ CONFIGURACIONES */}
            <Route
              path="settings"
              element={<ConfigurationPage titulo="Configuraciones" />}
            />
            <Route path="settings/comission" element={<ComissionConfig />} />
            <Route path="settings/fx-rates" element={<FxRatesConfig />} />
            <Route
              path="settings/payment-methods"
              element={<PaymentMethodsConfig />}
            />
            <Route
              path="settings/sales-channels"
              element={<SalesChannelsConfig />}
            />
            <Route path="settings/inventory" element={<InventoryConfig />} />
            <Route path="sales" element={<SalesConfig />} />
            <Route path="settings/providers" element={<ProvidersConfig />} />
            <Route path="settings/purchases" element={<PurchasesConfig />} />
            <Route path="settings/accounts" element={<AccountsConfig />} />
            <Route
              path="movements"
              element={
                <ProtectedRoute allowedRoles={["owner"]}>
                  <MovementsConfig />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* ðŸ›ï¸ VISTA DE VENDEDORES */}
          <Route
            path="/seller/*"
            element={
              <ProtectedRoute allowedRoles={["seller", "superadmin", "owner"]}>
                <SellerLayout />
              </ProtectedRoute>
            }
          >
            <Route path="products" element={<Products />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route
              path="my-sales"
              element={<TopSellersPage titulo="Mis ventas" />}
            />
            <Route path="payment-calculator" element={<PaymentCalculator />} />
            <Route
              path="quick-payment-calculator"
              element={<QuickPaymentCalculator />}
            />
            {/* AgregÃ¡ mÃ¡s rutas especÃ­ficas del vendedor aquÃ­ */}
          </Route>

          {/* ðŸšª RUTA POR DEFECTO */}
          <Route path="*" element={<FallbackRedirect />} />
        </Routes>
      </AuthContextProvider>
    </>
  );
}

