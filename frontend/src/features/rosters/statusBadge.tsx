import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { components } from "@/api/schema.gen";

type RosterStatus = components["schemas"]["RosterStatus"];

const STATUS_VARIANT: Record<RosterStatus, BadgeProps["variant"]> = {
  running: "warning",
  draft: "default",
  approved: "success",
  failed: "destructive",
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  running: "Running",
  draft: "Draft",
  approved: "Approved",
  failed: "Failed",
};

interface Props {
  status: RosterStatus;
  className?: string;
}

export function RosterStatusBadge({ status, className }: Props) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
