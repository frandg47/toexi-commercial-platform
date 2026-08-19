import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

import { ROUTE_TRANSLATIONS } from "@/utils/routeTranslations";
import { useLocation } from "react-router-dom";

const capitalize = (str) =>
  str.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const translate = (seg) => ROUTE_TRANSLATIONS[seg] || capitalize(seg);

export default function BreadcrumbHeader() {
  const location = useLocation();

  const clean = location.pathname
    .replace(/^\/dashboard/, "")
    .replace(/^\/seller/, "")
    .replace(/^\//, "");

  const segments = clean ? clean.split("/") : [];
  let accumulatedPath = "";

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {/* ROOT */}
        <BreadcrumbItem>
          <BreadcrumbLink
            to="/dashboard"
            className="text-white md:text-foreground hover:text-white md:hover:text-foreground"
          >
            Inicio
          </BreadcrumbLink>
        </BreadcrumbItem>

        {segments.map((seg, index) => {
          accumulatedPath += `/${seg}`;

          const isLast = index === segments.length - 1;

          return (
            <div key={index} className="flex items-center">
              <BreadcrumbSeparator className="mx-2 text-white md:text-muted-foreground" />

              {isLast ? (
                <BreadcrumbPage className="text-white md:text-foreground">
                  {translate(seg)}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbLink
                    to={accumulatedPath}
                    className="text-white md:text-foreground hover:text-white md:hover:text-foreground"
                  >
                    {translate(seg)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              )}
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
