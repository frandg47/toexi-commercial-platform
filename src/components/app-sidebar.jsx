import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import Header from "../components/Header";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";

import { useAuth } from "@/context/AuthContextProvider";

export default function AppSidebar({
  navMain = [],
  navSecondary = [],
  title = "Toexi Tech",
  actionButtonLabel,
  onActionClick,
  actionButtons,
}) {
  const { user, profile } = useAuth();

  const displayUser =
    user || profile
      ? {
          id: profile?.id || "",
          name:
            profile?.name ||
            user?.user_metadata?.full_name ||
            user?.user_metadata?.name ||
            "Usuario",
          email: profile?.email || user?.email || "",
          avatar:
            user?.user_metadata?.avatar_url ||
            user?.user_metadata?.picture ||
            "/avatars/default.jpg",
          role: profile?.role || "",
        }
      : {
          name: "Cargando…",
          email: "",
          avatar: "/avatars/default.jpg",
        };

  return (
    <Sidebar collapsible="offcanvas">
      <Header />

      <SidebarContent>
        <NavMain
          items={navMain}
          actionButtonLabel={actionButtonLabel}
          onActionClick={onActionClick}
          actionButtons={actionButtons}
        />

        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={displayUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
