import { SiteHeader } from "@/components/site-header";
import OrdersTable from "../components/OrdersTable";

const OrdersPage = () => {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <OrdersTable />
    </div>
  );
};

export default OrdersPage;
