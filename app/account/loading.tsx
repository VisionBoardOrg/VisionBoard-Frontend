import { AppShell } from "@/components/layout/AppShell";
import { AccountSettingsSkeleton } from "@/components/ui/Skeleton";

export default function AccountLoading() {
  return (
    <AppShell workspaceId={null} role={null}>
      <div className="animate-in fade-in-50 duration-200">
        <AccountSettingsSkeleton />
      </div>
    </AppShell>
  );
}
