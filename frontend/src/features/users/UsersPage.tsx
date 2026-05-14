import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function UsersPage() {
  return (
    <div>
      <PageHeader title="Users" description="Manage user accounts and change your password." />
      <ComingSoon description="User management arrives in Phase 5." />
    </div>
  );
}
