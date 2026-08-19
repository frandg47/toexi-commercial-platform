import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconApps, IconX } from "@tabler/icons-react";

export default function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("pwa-banner-dismissed");
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
      window.deferredPWAInstallPrompt = e;
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa-banner-dismissed", "1");
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 w-full px-4 z-[9999]">
      <Card className="border shadow-lg bg-background">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          {/* Icon */}
          <div className="bg-primary/10 text-primary p-2 rounded-lg">
            <IconApps className="h-5 w-5" />
          </div>

          {/* Text */}
          <div className="text-sm flex-1">
            <p className="font-semibold">Instalá esta app</p>
            <p className="text-muted-foreground text-xs">
              Agregala a tu dispositivo para un acceso más rápido
            </p>
          </div>

          {/* Action */}
          <Button
            size="sm"
            onClick={handleInstall}
            className="font-medium"
          >
            Instalar
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <IconX className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
