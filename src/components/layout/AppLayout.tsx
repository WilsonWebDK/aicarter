import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="hidden md:flex h-14 items-center border-b px-4">
            <SidebarTrigger />
          </header>
          <main className="flex-1 pb-20 md:pb-0">
            <Outlet />
          </main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
