import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function GenerateRosterPage() {
  return (
    <div>
      <PageHeader
        title="Generate roster"
        description="Multi-step wizard to launch a solver run."
      />
      <ComingSoon description="The 5-step wizard arrives in Phase 4." />
    </div>
  );
}
