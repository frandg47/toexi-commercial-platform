import { SiteHeader } from "@/components/site-header";
import { useState } from "react";
import CustomersTable from "../components/CustomersTable";
import DialogAddCustomer from "../components/DialogAddCustomer";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContextProvider";

const CustomersPage = () => {
  const [refreshToken, setRefreshToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { role } = useAuth();
  const isSellerView = role === "seller";
  const handleCustomerCreated = () => {
    setRefreshToken((current) => current + 1);
    setDialogOpen(false);
  };

  return (
    <>
      <div className="@container/main flex flex-1 flex-col gap-4 py-6">
        <CustomersTable
          isSellerView={isSellerView}
          refreshToken={refreshToken}
          onAdd={
            <Button onClick={() => setDialogOpen(true)}>
              <IconPlus className="h-4 w-4" />
              Nuevo cliente
            </Button>
          }
        />
      </div>

      {/* Modal para registrar cliente */}
      <DialogAddCustomer
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleCustomerCreated}
      />
    </>
  );
};

export default CustomersPage;
