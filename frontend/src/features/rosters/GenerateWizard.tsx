import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn, minToTime, minToDuration } from "@/lib/utils";
import { getApiErrorMessage } from "@/api/client";
import { notify } from "@/lib/toast";
import { useCreateRoster, useProfiles, useRosters } from "./hooks";
import { useDemands } from "@/features/demands/hooks";
import type { components } from "@/api/schema.gen";

type DemandOut = components["schemas"]["DemandOut"];
type ProfileOut = components["schemas"]["ProfileOut"];

interface WizardState {
  profileId: number | null;
  name: string;
  rosterStart: string;
  numDays: number;
  targetWorkMin: number;
  demandIds: Set<number>;
  previousRosterId: number | null;
}

const STEPS = [
  { id: 1, label: "Profile" },
  { id: 2, label: "Window" },
  { id: 3, label: "Demands" },
  { id: 4, label: "Chain" },
  { id: 5, label: "Review" },
] as const;

const DEFAULT_TARGET_WORK_MIN = 2400; // 40h × 60

export function GenerateWizard() {
  const navigate = useNavigate();
  const profilesQuery = useProfiles();
  const create = useCreateRoster();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() => ({
    profileId: null,
    name: "",
    rosterStart: format(new Date(), "yyyy-MM-dd"),
    numDays: 7,
    targetWorkMin: DEFAULT_TARGET_WORK_MIN,
    demandIds: new Set(),
    previousRosterId: null,
  }));

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  // Derive the demand-window range from current state.
  const windowEnd = useMemo(() => {
    if (!state.rosterStart || state.numDays <= 0) return null;
    return format(addDays(parseISO(state.rosterStart), state.numDays - 1), "yyyy-MM-dd");
  }, [state.rosterStart, state.numDays]);

  // Validators per step.
  const stepValid: Record<number, boolean> = {
    1: state.profileId != null,
    2:
      !!state.name.trim() &&
      !!state.rosterStart &&
      state.numDays > 0 &&
      state.targetWorkMin > 0,
    3: true, // demands optional
    4: true, // chain optional
    5: true,
  };

  const canAdvance = stepValid[step];

  function next() {
    if (!canAdvance) return;
    setStep((s) => Math.min(STEPS.length, s + 1));
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  function submit() {
    if (state.profileId == null) return;
    create.mutate(
      {
        profile_id: state.profileId,
        name: state.name.trim(),
        roster_start: state.rosterStart,
        num_days: state.numDays,
        target_work_min: state.targetWorkMin,
        demand_ids: Array.from(state.demandIds),
        previous_roster_id: state.previousRosterId,
      },
      {
        onSuccess: (data) => {
          notify.success("Solver dispatched", `Watching roster #${data.id}…`);
          navigate(`/rosters/${data.id}`);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {step === 1 && (
        <ProfileStep
          profiles={profilesQuery.data ?? []}
          loading={profilesQuery.isLoading}
          error={profilesQuery.error}
          value={state.profileId}
          onChange={(id) => update("profileId", id)}
        />
      )}
      {step === 2 && (
        <WindowStep
          name={state.name}
          rosterStart={state.rosterStart}
          numDays={state.numDays}
          targetWorkMin={state.targetWorkMin}
          onChange={update}
        />
      )}
      {step === 3 && state.rosterStart && windowEnd && (
        <DemandsStep
          from={state.rosterStart}
          to={windowEnd}
          selected={state.demandIds}
          onToggle={(id) => {
            const next = new Set(state.demandIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            update("demandIds", next);
          }}
          onSelectAll={(ids) => update("demandIds", new Set(ids))}
          onClearAll={() => update("demandIds", new Set())}
        />
      )}
      {step === 4 && (
        <ChainStep
          value={state.previousRosterId}
          currentProfileId={state.profileId}
          onChange={(id) => update("previousRosterId", id)}
        />
      )}
      {step === 5 && (
        <ReviewStep
          state={state}
          profile={profilesQuery.data?.find((p) => p.id === state.profileId)}
        />
      )}

      {create.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not generate roster</AlertTitle>
          <AlertDescription>{getApiErrorMessage(create.error)}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="ghost" onClick={back} disabled={step === 1 || create.isPending}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {step < STEPS.length ? (
          <Button onClick={next} disabled={!canAdvance}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {create.isPending ? "Dispatching…" : "Generate roster"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Stepper ------------------------------ */

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-primary/10 text-primary",
                !done && !active && "border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.id}
            </span>
            <span
              className={cn(
                "text-sm",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="ml-2 hidden h-px flex-1 bg-border sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------- Step 1: Profile ----------------------------- */

interface ProfileStepProps {
  profiles: ProfileOut[];
  loading: boolean;
  error: unknown;
  value: number | null;
  onChange: (id: number) => void;
}

function ProfileStep({ profiles, loading, error, value, onChange }: ProfileStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select a profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The profile defines which staff and shifts are eligible, and the solver weights.
        </p>
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load profiles</AlertTitle>
            <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
          </Alert>
        ) : profiles.length === 0 ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No profiles yet</AlertTitle>
            <AlertDescription>
              Create a profile in the Profiles section before generating a roster.
            </AlertDescription>
          </Alert>
        ) : (
          <Select
            value={value != null ? String(value) : undefined}
            onValueChange={(v) => onChange(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a profile…" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Step 2: Window ----------------------------- */

interface WindowStepProps {
  name: string;
  rosterStart: string;
  numDays: number;
  targetWorkMin: number;
  onChange: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

function WindowStep({ name, rosterStart, numDays, targetWorkMin, onChange }: WindowStepProps) {
  const weeklyHours = (targetWorkMin / 60).toFixed(1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster window</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="roster-name">Name</Label>
            <Input
              id="roster-name"
              value={name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="Week of 2026-05-18"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="roster-start">Start date</Label>
            <Input
              id="roster-start"
              type="date"
              value={rosterStart}
              onChange={(e) => onChange("rosterStart", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="num-days">Days</Label>
            <Input
              id="num-days"
              type="number"
              min={1}
              max={90}
              value={numDays}
              onChange={(e) => onChange("numDays", Math.max(1, Number(e.target.value) || 1))}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="target-work-min">Target work minutes / staff</Label>
            <Input
              id="target-work-min"
              type="number"
              min={0}
              step={30}
              value={targetWorkMin}
              onChange={(e) =>
                onChange("targetWorkMin", Math.max(0, Number(e.target.value) || 0))
              }
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              ≈ {weeklyHours}h over {numDays} day{numDays === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Step 3: Demands ----------------------------- */

interface DemandsStepProps {
  from: string;
  to: string;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  onClearAll: () => void;
}

function DemandsStep({ from, to, selected, onToggle, onSelectAll, onClearAll }: DemandsStepProps) {
  const demandsQuery = useDemands({ from, to });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const items = demandsQuery.data ?? [];
    if (!search.trim()) return items;
    const needle = search.trim().toLowerCase();
    return items.filter(
      (d) =>
        d.date.includes(needle) ||
        String(d.headcount).includes(needle),
    );
  }, [demandsQuery.data, search]);

  const allFilteredIds = useMemo(() => filtered.map((d) => d.id), [filtered]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demands in window</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {from} → {to}. Selected demands cap the headcount the solver must satisfy.
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="muted">{selected.size} selected</Badge>
            {allFilteredIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  allFilteredSelected ? onClearAll() : onSelectAll(allFilteredIds)
                }
              >
                {allFilteredSelected ? "Clear all" : "Select all"}
              </Button>
            )}
          </div>
        </div>

        <Input
          placeholder="Filter by date or headcount…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {demandsQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : demandsQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load demands</AlertTitle>
            <AlertDescription>{getApiErrorMessage(demandsQuery.error)}</AlertDescription>
          </Alert>
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            No demands in this window.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Headcount</TableHead>
                  <TableHead>Skill value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <DemandRow
                    key={d.id}
                    demand={d}
                    checked={selected.has(d.id)}
                    onToggle={() => onToggle(d.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DemandRow({
  demand,
  checked,
  onToggle,
}: {
  demand: DemandOut;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onToggle}>
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label="Select demand" />
      </TableCell>
      <TableCell className="font-mono text-xs">{demand.date}</TableCell>
      <TableCell className="font-mono text-xs">
        {minToTime(demand.start_min)} – {minToTime(demand.end_min)}
      </TableCell>
      <TableCell className="font-mono">{demand.headcount}</TableCell>
      <TableCell className="text-muted-foreground">
        {demand.skill_value_id != null ? `#${demand.skill_value_id}` : "—"}
      </TableCell>
    </TableRow>
  );
}

/* ----------------------------- Step 4: Chain ----------------------------- */

interface ChainStepProps {
  value: number | null;
  currentProfileId: number | null;
  onChange: (id: number | null) => void;
}

function ChainStep({ value, currentProfileId, onChange }: ChainStepProps) {
  const rostersQuery = useRosters({});
  const candidates = useMemo(() => {
    const items = (rostersQuery.data ?? []).filter(
      (r) =>
        (r.status === "draft" || r.status === "approved") &&
        r.result != null &&
        // Same profile only — chaining across profiles rarely makes sense.
        (currentProfileId == null || r.profile_id === currentProfileId),
    );
    items.sort((a, b) => b.roster_start.localeCompare(a.roster_start));
    return items.slice(0, 20);
  }, [rostersQuery.data, currentProfileId]);

  // If user changes profile after picking a chain target, clear if mismatched.
  useEffect(() => {
    if (value && !candidates.some((r) => r.id === value)) {
      onChange(null);
    }
  }, [candidates, value, onChange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chain from previous roster (optional)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Carry over consecutive-day counts so cross-boundary rules
          (e.g. "no day shift after a night shift") apply across rosters.
        </p>
        {rostersQuery.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={value != null ? String(value) : "none"}
            onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Don't chain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Don't chain</SelectItem>
              {candidates.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name} · {r.roster_start} ({r.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {candidates.length === 0 && !rostersQuery.isLoading && (
          <p className="text-xs text-muted-foreground">
            No previous rosters with usable results
            {currentProfileId != null && " for this profile"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Step 5: Review ----------------------------- */

function ReviewStep({ state, profile }: { state: WizardState; profile: ProfileOut | undefined }) {
  const windowEnd = state.rosterStart
    ? format(addDays(parseISO(state.rosterStart), state.numDays - 1), "yyyy-MM-dd")
    : "—";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <ReviewRow label="Profile" value={profile?.name ?? `#${state.profileId}`} />
          <ReviewRow label="Name" value={state.name || "—"} />
          <ReviewRow
            label="Window"
            value={`${state.rosterStart} → ${windowEnd} (${state.numDays} day${state.numDays === 1 ? "" : "s"})`}
          />
          <ReviewRow
            label="Target work / staff"
            value={`${minToDuration(state.targetWorkMin)} (${state.targetWorkMin} min)`}
          />
          <ReviewRow label="Demands selected" value={String(state.demandIds.size)} />
          <ReviewRow
            label="Chained from"
            value={state.previousRosterId != null ? `#${state.previousRosterId}` : "—"}
          />
        </dl>
        <Alert variant="info" className="mt-6">
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Ready to go</AlertTitle>
          <AlertDescription>
            Generate dispatches the solver as a Celery task. You'll be redirected
            to the roster page where progress polls every 2 seconds.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
