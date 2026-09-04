import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContextProvider";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import ProvidersTable from "@/components/ProvidersTable";
import DialogAddProvider from "@/components/DialogAddProvider";

const ProvidersConfig = () => {
  const { role } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <>
      <div className="@container/main flex flex-1 flex-col gap-4 py-6">
        <ProvidersTable
          onAdd={
            <Button onClick={() => setDialogOpen(true)}>
              <IconPlus className="h-4 w-4" />
              Agregar
            </Button>
          }
        />
      </div>

      <DialogAddProvider
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => setDialogOpen(false)}
      />
    </>
  );
};

export default ProvidersConfig;
