import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function ProfilesListPage() {
  return (
    <div>
      <PageHeader title="Profiles" description="Scheduling profiles bundle staff, shifts and solver tuning." />
      <ComingSoon description="Profile list arrives in Phase 5." />
    </div>
  );
}
