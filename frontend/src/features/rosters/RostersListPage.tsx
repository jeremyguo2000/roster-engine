import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function RostersListPage() {
  return (
    <div>
      <PageHeader
        title="Rosters"
        description="Browse, filter, approve and generate rosters."
      />
      <ComingSoon description="List page arrives in Phase 3." />
    </div>
  );
}
