import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { useCurrentUser } from "@/features/auth/useAuth";

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          user
            ? `Welcome back, ${user.username}.`
            : "Summary of staff, profiles, and recent rosters."
        }
      />
      <ComingSoon description="Summary cards arrive in Phase 5." />
    </div>
  );
}
