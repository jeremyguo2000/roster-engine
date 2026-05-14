import { Link } from "react-router-dom";
import { CalendarRange, Loader2, Sparkles, UserRound, Users } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useStaffList } from "@/features/staff/hooks";
import { useProfiles, useRosters } from "@/features/rosters/hooks";
import { RosterStatusBadge } from "@/features/rosters/statusBadge";

export function DashboardPage() {
  const staff = useStaffList();
  const profiles = useProfiles();
  const rosters = useRosters();

  const recentRosters = (rosters.data ?? []).slice(0, 5);
  const runningCount = (rosters.data ?? []).filter((r) => r.status === "running").length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Snapshot of staff, profiles, and recent solver activity."
        actions={
          <Button asChild>
            <Link to="/rosters/new">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate roster
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<UserRound className="h-5 w-5" />}
          label="Active staff"
          value={staff.data?.length}
          loading={staff.isLoading}
          href="/staff"
        />
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          label="Profiles"
          value={profiles.data?.length}
          loading={profiles.isLoading}
          href="/profiles"
        />
        <SummaryCard
          icon={<CalendarRange className="h-5 w-5" />}
          label="Rosters"
          value={rosters.data?.length}
          loading={rosters.isLoading}
          href="/rosters"
        />
        <SummaryCard
          icon={<Loader2 className={runningCount > 0 ? "h-5 w-5 animate-spin" : "h-5 w-5"} />}
          label="Currently solving"
          value={runningCount}
          loading={rosters.isLoading}
          href="/rosters"
          accent={runningCount > 0}
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent rosters</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/rosters">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rosters.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : recentRosters.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No rosters yet — generate one to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {recentRosters.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/rosters/${r.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {format(parseISO(r.roster_start), "yyyy-MM-dd")} · {r.num_days} days
                      </p>
                    </div>
                    <RosterStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
  href: string;
  accent?: boolean;
}

function SummaryCard({ icon, label, value, loading, href, accent }: SummaryCardProps) {
  return (
    <Link to={href} className="block">
      <Card className={accent ? "border-primary/40 bg-primary/5" : "transition-colors hover:bg-muted/30"}>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-serif text-3xl">{value ?? 0}</p>
            )}
          </div>
          <div
            className={
              accent
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"
                : "flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
            }
          >
            {icon}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
