import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function StaffListPage() {
  return (
    <div>
      <PageHeader title="Staff" description="Manage staff, skills, permitted shifts and leaves." />
      <ComingSoon description="Staff management arrives in Phase 5." />
    </div>
  );
}
