import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function RosterDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <PageHeader
        title={`Roster #${id}`}
        description="Interactive grid of shift assignments across the roster window."
      />
      <ComingSoon description="The roster grid (centerpiece) arrives in Phase 3." />
    </div>
  );
}
