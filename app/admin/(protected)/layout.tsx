import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import { ConfirmProvider } from "@/context/ConfirmContext";

export const metadata = {
  title: {
    default: "Admin",
    template: "%s | VisionBoard Admin",
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;

  const isAuthenticated = await verifyAdminSession(sessionCookie);

  if (!isAuthenticated) {
    redirect("/admin/login");
  }

  return (
    <ConfirmProvider>
      <div className="flex h-dvh bg-offwhite font-sans overflow-hidden">
        <AdminSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <AdminHeader />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
