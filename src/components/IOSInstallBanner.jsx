import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconX, IconUpload, IconDeviceMobile } from "@tabler/icons-react";

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export default function IOSInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("ios-banner-dismissed");
    if (dismissed) return;

    if (isIOS() && !isInStandaloneMode()) {
      setShow(true);
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("ios-banner-dismissed", "1");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 w-full px-4 z-[9999]">
      <Card className="border shadow-lg bg-background">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          {/* Icono grande izq */}
          <div className="bg-primary/10 text-primary p-2 rounded-lg">
            <IconDeviceMobile className="h-5 w-5" />
          </div>

          {/* Texto */}
          <div className="text-sm">
            <p className="font-semibold">Instalá esta app en tu iPhone</p>
            <p className="text-muted-foreground text-xs">
              Tocá el botón de menú{" "}
              <IconUpload className="inline-block h-4 w-4" />{" "}y elegí{" "}
              <strong>“Agregar a inicio”</strong> o <strong>“Añadir a pantalla de inicio”</strong>
            </p>
          </div>

          {/* Botón cerrar */}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <IconX className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
