import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Moon } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { minToTime, minToDuration } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { groupColor } from "./groupColors";
import type { RosterResult, RosterShiftInfo } from "./rosterResult";
import type { components } from "@/api/schema.gen";

type DemandOut = components["schemas"]["DemandOut"];

interface Props {
  result: RosterResult;
  demands?: DemandOut[];
  /** Render a red badge in the per-row max-consec column when ≥ this. */
  maxConsecWarnAt?: number;
}

const REST_DAY = "—";

export function RosterGrid({ result, demands, maxConsecWarnAt = 6 }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const rosterStart = useMemo(() => parseISO(result.roster_start), [result.roster_start]);
  const days = useMemo(
    () => Array.from({ length: result.num_days }, (_, i) => addDays(rosterStart, i)),
    [rosterStart, result.num_days],
  );

  // Per-day headcount totals + demand totals (for the footer row).
  const dayStats = useMemo(() => {
    const headcount = new Array(result.num_days).fill(0);
    for (const empAssignments of Object.values(result.assignments)) {
      for (const [day, code] of Object.entries(empAssignments)) {
        const shift = result.shifts[code];
        if (shift?.is_work_shift) headcount[Number(day)] += 1;
      }
    }
    const demandByDay = new Array(result.num_days).fill(0);
    if (demands) {
      for (const d of demands) {
        const dayIdx = Math.round(
          (parseISO(d.date).getTime() - rosterStart.getTime()) / 86_400_000,
        );
        if (dayIdx >= 0 && dayIdx < result.num_days) {
          demandByDay[dayIdx] = Math.max(demandByDay[dayIdx], d.headcount);
        }
      }
    }
    return { headcount, demandByDay };
  }, [result, demands, rosterStart]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-auto rounded-lg border bg-background">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-30 min-w-[16rem] border-b border-r bg-muted/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur"
              >
                Staff
              </th>
              {days.map((d, i) => (
                <th
                  key={i}
                  className={cn(
                    "sticky top-0 z-20 min-w-[5.5rem] border-b border-r bg-muted/60 px-2 py-2 text-center text-xs font-medium text-muted-foreground backdrop-blur",
                    isWeekend(d) && "bg-muted",
                  )}
                >
                  <div className="font-mono text-[0.7rem] uppercase">
                    {format(d, "EEE")}
                  </div>
                  <div className="text-foreground">{format(d, "MMM d")}</div>
                </th>
              ))}
              <th className="sticky top-0 z-20 min-w-[6rem] border-b bg-muted/60 px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                Max consec
              </th>
            </tr>
          </thead>
          <tbody>
            {result.staff.map((staff) => {
              const empAssignments = result.assignments[staff.employee_id] ?? {};
              const maxConsec = result.staff_max_consec[staff.employee_id] ?? 0;
              return (
                <tr key={staff.employee_id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-[16rem] border-b border-r bg-background px-3 py-2 text-left align-middle group-hover:bg-muted/30"
                  >
                    <div className="font-medium leading-tight">{staff.fullname}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {staff.employee_id}
                    </div>
                  </th>
                  {days.map((_, dayIdx) => {
                    const code = empAssignments[String(dayIdx)];
                    const shift = code ? result.shifts[code] : undefined;
                    return (
                      <td
                        key={dayIdx}
                        className="border-b border-r p-1 text-center"
                      >
                        <ShiftCell code={code} shift={shift} isDark={isDark} />
                      </td>
                    );
                  })}
                  <td className="border-b px-2 py-2 text-center">
                    <Badge
                      variant={maxConsec >= maxConsecWarnAt ? "destructive" : "muted"}
                      className="font-mono"
                    >
                      {maxConsec}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {demands && (
            <tfoot>
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t bg-muted/40 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Headcount / demand
                </th>
                {dayStats.headcount.map((hc, i) => {
                  const dem = dayStats.demandByDay[i];
                  const diff = hc - dem;
                  return (
                    <td
                      key={i}
                      className="border-t bg-muted/40 px-2 py-2 text-center font-mono text-xs"
                    >
                      <div className="text-foreground">{hc}</div>
                      <div
                        className={cn(
                          "text-[0.7rem]",
                          dem === 0
                            ? "text-muted-foreground/60"
                            : diff < 0
                            ? "text-destructive"
                            : diff > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {dem === 0 ? "—" : `/ ${dem}`}
                      </div>
                    </td>
                  );
                })}
                <td className="border-t bg-muted/40" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </TooltipProvider>
  );
}

function ShiftCell({
  code,
  shift,
  isDark,
}: {
  code: string | undefined;
  shift: RosterShiftInfo | undefined;
  isDark: boolean;
}) {
  if (!code || !shift) {
    return (
      <div
        aria-label="Rest day"
        className="flex h-10 items-center justify-center rounded-md bg-muted/40 font-mono text-xs text-muted-foreground/60"
      >
        {REST_DAY}
      </div>
    );
  }

  const isLeave = !shift.is_work_shift;
  const colors = isLeave ? null : groupColor(shift.group, isDark);

  const style = colors
    ? {
        backgroundColor: colors.bg,
        color: colors.fg,
        borderColor: colors.border,
      }
    : undefined;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          style={style}
          className={cn(
            "relative flex h-10 cursor-default items-center justify-center rounded-md border font-mono text-xs font-semibold transition-shadow hover:shadow-sm",
            isLeave &&
              "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
          )}
        >
          {code}
          {shift.is_night_shift && (
            <Moon
              className="absolute right-1 top-1 h-3 w-3 opacity-70"
              aria-label="Night shift"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          <div className="font-medium">{shift.name}</div>
          <div className="font-mono text-[0.7rem] text-muted-foreground">
            {minToTime(shift.start_time)} – {minToTime(shift.end_time)}
            {shift.work_time > 0 && ` · ${minToDuration(shift.work_time)}`}
          </div>
          <div className="text-[0.7rem] text-muted-foreground">
            Group {shift.group}
            {shift.is_night_shift && " · night"}
            {!shift.is_work_shift && " · leave"}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}
