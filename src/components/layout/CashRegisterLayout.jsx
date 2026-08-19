import { Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { IconArrowLeft, IconCash } from "@tabler/icons-react";
import ThemeToggle from "@/components/theme-toggle";

export default function CashRegisterLayout({ canGoBack = true }) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b bg-green-600/80 md:bg-background/90 dark:bg-background/95 backdrop-blur-sm transition-[width,height] ease-linear">
        <div className="flex w-full items-center gap-2 px-4 lg:px-6">
          {canGoBack && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white md:text-foreground"
              onClick={() => navigate("/dashboard")}
            >
              <IconArrowLeft className="h-5 w-5" />
            </Button>
          )}

          <div className="flex items-center gap-2 ml-1">
            <IconCash className="h-5 w-5 text-white md:text-primary" />
            <span className="text-sm font-semibold text-white md:text-foreground">
              Panel de Caja
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 md:p-6 w-full mx-auto max-w-6xl">
        <Outlet />
      </main>
    </div>
  );
}
