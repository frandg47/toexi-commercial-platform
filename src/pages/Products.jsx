import ProductsTable from "../components/ProductsTable";
import { useAuth } from "@/context/AuthContextProvider";
import { SiteHeader } from "@/components/site-header"; // mantiene compatibilidad con el dashboard
import SectionCardsProducts from "../components/SectionCardsProducts";

const Products = () => {
  const { role } = useAuth();
  const isSellerView = role === "seller";

  return (
    <>
      {/* <SiteHeader titulo={titulo || "Productos"} /> */}

      {/* 🔹 Contenido principal */}
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 ">
          <ProductsTable isSellerView={isSellerView} />
        </div>
        {/* <div className="flex flex-col gap-4 md:gap-6 py-6">
          <SectionCardsProducts />
        </div> */}
      </div>
    </>
  );
};

export default Products;
