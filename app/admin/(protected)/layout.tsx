import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";

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

  // Verify the signed admin session token
  const isAuthenticated = await verifyAdminSession(sessionCookie);

  // The login page is nested under /admin/login — exclude it from the auth guard
  // by checking inside each protected page instead. For the layout we redirect to
  // login when the session is invalid so all non-login routes are protected.
  if (!isAuthenticated) {
    redirect("/admin/login");
  }

  return (
    <div className="flex h-screen bg-offwhite font-sans overflow-hidden">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
