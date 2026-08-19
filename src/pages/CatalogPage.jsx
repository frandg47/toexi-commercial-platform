import { useLocation } from "react-router-dom";
import CatalogTable from "../components/CatalogTable";

export default function CatalogPage() {
  const { pathname } = useLocation();

  let tipo = "all";
  if (pathname.endsWith("/catalog/brands")) tipo = "brands";
  else if (pathname.endsWith("/catalog/categories")) tipo = "categories";

  return (
    <>
      <div className="mt-6">
        <CatalogTable tipo={tipo} />
      </div>
    </>
  );
}
