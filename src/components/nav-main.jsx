import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, } from "@/components/ui/sidebar";
import { IconCirclePlusFilled, IconChevronDown, IconInfoCircle, } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/components/ui/sidebar";


export function NavMain({
  items,
  actionButtonLabel,
  onActionClick,
  actionButtons,
}) {
  const { collapsed } = useSidebar(); // <-- clave

  const buttons = Array.isArray(actionButtons) && actionButtons.length > 0
    ? actionButtons
    : actionButtonLabel
    ? [{ label: actionButtonLabel, onClick: onActionClick }]
    : [];

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">

        {buttons.length > 0 && (
          <SidebarMenu>
            {buttons.map((btn, index) => (
              <SidebarMenuItem key={`${btn.label}-${index}`}>
                <Button
                  variant="outline"
                  className={`w-full justify-start bg-gray-900 text-white hover:bg-gray-800 hover:text-white
                    ${collapsed ? "justify-center" : ""}
                  `}
                  onClick={btn.onClick}
                >
                  <IconCirclePlusFilled className="h-5 w-5" />
                  {!collapsed && <span className="ml-2">{btn.label}</span>}
                  {!collapsed && btn.badge && (
                    <Badge className="ml-auto bg-green-500 text-white border-0 text-[10px] px-1.5 py-0 h-5 font-semibold" variant="outline">
                      {btn.badge}
                    </Badge>
                  )}
                </Button>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}

        {/* Links */}
        {items.map((item, index) => {
          if (item.groupLabel) {
            return (
              <div key={`group-${item.groupLabel}-${index}`}>
                {!collapsed && (
                  <SidebarGroupLabel className="mt-4 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {item.groupLabel}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu>
                  {item.items.map((sub) =>
                    sub.items ? (
                      <DropMenu key={sub.title} item={sub} />
                    ) : (
                      <SidebarMenuItem key={sub.title}>
                        <NavLink
                          to={sub.url}
                          end
                          className={({ isActive }) =>
                            `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors
                             ${isActive ? "bg-primary text-primary-foreground shadow-sm" :
                              "hover:bg-muted hover:text-foreground"}
                             ${collapsed ? "justify-center px-2" : ""}`
                          }
                        >
                          {sub.icon && <sub.icon className="h-5 w-5" />}
                          {!collapsed && <span>{sub.title}</span>}
                        </NavLink>
                      </SidebarMenuItem>
                    )
                  )}
                </SidebarMenu>
              </div>
            );
          }

          return (
            <SidebarMenu key={`item-${item.title || index}`}>
              {item.items ? (
                <DropMenu item={item} />
              ) : (
                <SidebarMenuItem>
                  <NavLink
                    to={item.url}
                    end
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors
                       ${isActive ? "bg-primary text-primary-foreground shadow-sm" :
                        "hover:bg-muted hover:text-foreground"}
                       ${collapsed ? "justify-center px-2" : ""}`
                    }
                  >
                    {item.icon && <item.icon className="h-5 w-5" />}
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          );
        })}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}


function DropMenu({ item }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { collapsed } = useSidebar();

  const isAnyChildActive = item.items.some(
    (sub) => location.pathname === sub.url
  );

  const shouldOpen = open && !collapsed; // 🔥 nunca abrir en modo ícono

  return (
    <SidebarMenuItem className="flex flex-col">

      {/* Botón padre */}
      <button
        onClick={() => !collapsed && setOpen(!open)}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors
          ${isAnyChildActive || open
            ? "bg-primary text-primary-foreground shadow-sm"
            : "hover:bg-muted hover:text-foreground"}
          ${collapsed ? "justify-center px-2" : ""}
        `}
      >
        {item.icon && <item.icon className="h-5 w-5" />}

        {!collapsed && <span>{item.title}</span>}

        {!collapsed && (
          <IconChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* Submenú */}
      {shouldOpen && (
        <SidebarMenu className="pl-3 mt-1 flex flex-col gap-1">
          {item.items.map((sub) => (
            <SidebarMenuItem key={sub.title}>
              <NavLink
                to={sub.url}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors
                     ${isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                {sub.icon && <sub.icon className="h-4 w-4" />}
                {!collapsed && <span>{sub.title}</span>}
              </NavLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </SidebarMenuItem>
  );
}
