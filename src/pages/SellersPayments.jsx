import { useState } from "react";
import SellersTable from "@/components/SellersTable";

const SellersPayments = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <SellersTable refreshToken={refreshToken} />
    </div>
  );
};

export default SellersPayments;