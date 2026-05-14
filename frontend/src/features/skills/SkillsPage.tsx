import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export function SkillsPage() {
  return (
    <div>
      <PageHeader title="Skills" description="Skill types and values used to filter demand coverage." />
      <ComingSoon description="Skills CRUD arrives in Phase 5." />
    </div>
  );
}
