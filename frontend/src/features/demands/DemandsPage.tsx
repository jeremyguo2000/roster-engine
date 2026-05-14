import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function DemandsPage() {
  return (
    <div>
      <PageHeader title="Demands" description="Date-specific staffing demands linked to rosters." />
      <ComingSoon description="Demands page arrives in Phase 5." />
    </div>
  );
}
