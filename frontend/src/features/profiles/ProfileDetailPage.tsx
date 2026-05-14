import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function ProfileDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <PageHeader title={`Profile #${id}`} description="Configure staff, shifts, weights and conditional constraints." />
      <ComingSoon description="Profile editor arrives in Phase 5." />
    </div>
  );
}
