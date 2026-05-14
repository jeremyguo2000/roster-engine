import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function StaffDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <PageHeader title={`Staff #${id}`} description="Edit staff, manage skills, permitted shifts and leaves." />
      <ComingSoon description="Staff detail arrives in Phase 5." />
    </div>
  );
}
