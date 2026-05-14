import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function ShiftsPage() {
  return (
    <div>
      <PageHeader title="Shifts" description="Shift groups and shift definitions." />
      <ComingSoon description="Shifts CRUD arrives in Phase 5." />
    </div>
  );
}
