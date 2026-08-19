"use client";
import * as React from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { IconInfoCircle } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary({ items, ...props }) {
  const navigate = useNavigate();

  const showDevelopmentToast = (feature) => {
    toast("Funcionalidad en desarrollo", {
      description: `El módulo de ${feature} estará disponible próximamente.`,
      icon: <IconInfoCircle className="h-5 w-5 text-blue-500" />,
      duration: 3000,
    });
  };

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isHelp = item.title.toLowerCase() === "ayuda";

            return (
              <SidebarMenuItem key={item.title}>
                <NavLink
                  to={isHelp ? "#" : item.url} // evita que cambie la URL
                  end={item.exact}
                  onClick={(e) => {
                    // 🔹 Si es "Ayuda", mostramos toast y no navegamos
                    if (isHelp) {
                      e.preventDefault();
                      showDevelopmentToast("Ayuda");
                      return;
                    }

                    // 🔹 Si tiene una acción personalizada
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                      return;
                    }

                    // 🔹 Navegación normal
                    navigate(item.url);
                  }}
                  className={({ isActive }) => {
                    // 🔹 Evita pintarse si es el botón de Ayuda
                    const active =
                      !isHelp && isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-muted hover:text-foreground";

                    return `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${active}`;
                  }}
                >
                  {item.icon && <item.icon className="h-5 w-5" />}
                  <span>{item.title}</span>
                </NavLink>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
