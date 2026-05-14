import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertCircle, Plus, Trash2, Layers } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MutationError } from "@/components/shared/MutationError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  useAddProfileShift,
  useAddProfileStaff,
  useAddShiftGroupToProfile,
  useAddStaffGroupToProfile,
  useProfile,
  useProfileShifts,
  useProfileStaff,
  useRemoveProfileShift,
  useRemoveProfileStaff,
  useUpdateProfile,
  useUpdateProfileStaff,
} from "./hooks";
import { useStaffGroups, useStaffList } from "@/features/staff/hooks";
import { useShiftGroups, useShifts } from "@/features/shifts/hooks";
import { ConditionalConstraintsEditor } from "./ConditionalConstraintsEditor";
import { DEFAULT_CONFIG, parseProfileConfig, type ProfileConfig } from "./profileConfig";
import { getApiErrorMessage } from "@/api/client";
import { notify } from "@/lib/toast";
import type { components } from "@/api/schema.gen";

type StaffOut = components["schemas"]["StaffOut"];
type ShiftOut = components["schemas"]["ShiftOut"];

export function ProfileDetailPage() {
  const { id: idParam } = useParams();
  const id = idParam ? Number(idParam) : undefined;
  const numericId = id != null && Number.isFinite(id) ? id : undefined;
  const profile = useProfile(numericId);

  if (profile.isLoading) {
    return (
      <div>
        <PageHeader title="Profile" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <div>
        <PageHeader title="Profile" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load profile</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(profile.error, "Profile not found.")}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/profiles">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  const p = profile.data;

  return (
    <div>
      <PageHeader
        title={p.name}
        description="Configure staff, shifts, weights and conditional constraints."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/profiles">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>
        <TabsContent value="staff">
          <StaffTab profileId={p.id} />
        </TabsContent>
        <TabsContent value="shifts">
          <ShiftsTab profileId={p.id} />
        </TabsContent>
        <TabsContent value="config">
          <ConfigTab profileId={p.id} initial={parseProfileConfig(p.config)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------- Staff --------------------------------- */

function StaffTab({ profileId }: { profileId: number }) {
  const profileStaff = useProfileStaff(profileId);
  const allStaff = useStaffList();
  const groups = useStaffGroups();
  const add = useAddProfileStaff();
  const update = useUpdateProfileStaff();
  const remove = useRemoveProfileStaff();
  const bulkAdd = useAddStaffGroupToProfile();

  const [pickStaff, setPickStaff] = useState<string>("");
  const [pickGroup, setPickGroup] = useState<string>("");

  const staffById = useMemo(() => {
    const m = new Map<number, StaffOut>();
    for (const s of allStaff.data ?? []) m.set(s.id, s);
    return m;
  }, [allStaff.data]);

  const assigned = new Set((profileStaff.data ?? []).map((p) => p.staff_id));
  const available = (allStaff.data ?? []).filter((s) => !assigned.has(s.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add staff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Select value={pickStaff} onValueChange={setPickStaff}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a staff member" />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.full_name} · {s.employee_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!pickStaff || add.isPending}
              onClick={() =>
                add.mutate(
                  { profileId, staffId: Number(pickStaff) },
                  { onSuccess: () => setPickStaff("") },
                )
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Select value={pickGroup} onValueChange={setPickGroup}>
              <SelectTrigger>
                <SelectValue placeholder="…or bulk-add a whole staff group" />
              </SelectTrigger>
              <SelectContent>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!pickGroup || bulkAdd.isPending}
              onClick={() =>
                bulkAdd.mutate(
                  { profileId, groupId: Number(pickGroup) },
                  { onSuccess: () => setPickGroup("") },
                )
              }
            >
              <Layers className="mr-1 h-4 w-4" />
              Bulk add
            </Button>
          </div>
          <MutationError error={add.error ?? bulkAdd.error} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {profileStaff.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-20" />
            </div>
          ) : (profileStaff.data ?? []).length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No staff in this profile yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="w-32">Excluded</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profileStaff.data ?? []).map((ps) => {
                  const s = staffById.get(ps.staff_id);
                  return (
                    <TableRow key={ps.staff_id}>
                      <TableCell>
                        {s ? (
                          <Link to={`/staff/${s.id}`} className="hover:underline">
                            <span className="font-medium">{s.full_name}</span>{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {s.employee_id}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">#{ps.staff_id}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={ps.excluded}
                          onCheckedChange={(v) =>
                            update.mutate({
                              profileId,
                              staffId: ps.staff_id,
                              excluded: v,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Remove staff">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={`Remove ${s?.full_name ?? "staff"} from profile?`}
                          description="They will not be considered for future rosters until re-added."
                          confirmLabel="Remove"
                          destructive
                          onConfirm={() =>
                            remove.mutate({ profileId, staffId: ps.staff_id })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <MutationError error={update.error ?? remove.error} />
    </div>
  );
}

/* --------------------------------- Shifts --------------------------------- */

function ShiftsTab({ profileId }: { profileId: number }) {
  const profileShifts = useProfileShifts(profileId);
  const allShifts = useShifts();
  const groups = useShiftGroups();
  const add = useAddProfileShift();
  const remove = useRemoveProfileShift();
  const bulkAdd = useAddShiftGroupToProfile();

  const [pickShift, setPickShift] = useState<string>("");
  const [pickGroup, setPickGroup] = useState<string>("");

  const shiftById = useMemo(() => {
    const m = new Map<number, ShiftOut>();
    for (const s of allShifts.data ?? []) m.set(s.id, s);
    return m;
  }, [allShifts.data]);

  const assigned = new Set((profileShifts.data ?? []).map((p) => p.shift_id));
  const available = (allShifts.data ?? []).filter((s) => !assigned.has(s.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add shift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Select value={pickShift} onValueChange={setPickShift}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a shift" />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.code} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!pickShift || add.isPending}
              onClick={() =>
                add.mutate(
                  { profileId, shiftId: Number(pickShift) },
                  { onSuccess: () => setPickShift("") },
                )
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Select value={pickGroup} onValueChange={setPickGroup}>
              <SelectTrigger>
                <SelectValue placeholder="…or bulk-add a whole shift group" />
              </SelectTrigger>
              <SelectContent>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!pickGroup || bulkAdd.isPending}
              onClick={() =>
                bulkAdd.mutate(
                  { profileId, groupId: Number(pickGroup) },
                  { onSuccess: () => setPickGroup("") },
                )
              }
            >
              <Layers className="mr-1 h-4 w-4" />
              Bulk add
            </Button>
          </div>
          <MutationError error={add.error ?? bulkAdd.error} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {profileShifts.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-20" />
            </div>
          ) : (profileShifts.data ?? []).length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No shifts in this profile yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profileShifts.data ?? []).map((ps) => {
                  const s = shiftById.get(ps.shift_id);
                  return (
                    <TableRow key={ps.shift_id}>
                      <TableCell className="font-mono">
                        {s?.code ?? `#${ps.shift_id}`}
                      </TableCell>
                      <TableCell>{s?.name ?? "—"}</TableCell>
                      <TableCell>
                        {s ? <Badge variant="outline">{s.group.code}</Badge> : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Remove shift">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={`Remove "${s?.code ?? "shift"}" from profile?`}
                          description="The solver will no longer consider this shift for assignments."
                          confirmLabel="Remove"
                          destructive
                          onConfirm={() =>
                            remove.mutate({ profileId, shiftId: ps.shift_id })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <MutationError error={remove.error} />
    </div>
  );
}

/* --------------------------------- Config --------------------------------- */

function ConfigTab({
  profileId,
  initial,
}: {
  profileId: number;
  initial: ProfileConfig;
}) {
  const update = useUpdateProfile();
  const groups = useShiftGroups();
  const [config, setConfig] = useState<ProfileConfig>(initial);
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  // If the profile reloads with a different config (e.g. after a save by
  // someone else), reseed local state.
  useEffect(() => {
    setConfig(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)]);

  const set = <K extends keyof ProfileConfig>(key: K, value: ProfileConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Solver weights</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Overstaff"
            help="Penalty per extra staff per day"
            value={config.weight_overstaff}
            onChange={(v) => set("weight_overstaff", v)}
          />
          <NumberField
            label="Consecutive days"
            help="Penalty per consecutive working day"
            value={config.weight_consec}
            onChange={(v) => set("weight_consec", v)}
          />
          <NumberField
            label="Burden"
            help="Combined night/weekend burden weight"
            value={config.weight_burden}
            onChange={(v) => set("weight_burden", v)}
          />
          <NumberField
            label="Night"
            value={config.weight_night}
            onChange={(v) => set("weight_night", v)}
          />
          <NumberField
            label="Weekend"
            value={config.weight_weekend}
            onChange={(v) => set("weight_weekend", v)}
          />
          <NumberField
            label="Time limit (s)"
            value={config.time_limit}
            onChange={(v) => set("time_limit", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conditional constraints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            "If trigger group sees value X on day d, then on day d+offset enforce
            enforce-group = value Y." Use <span className="font-mono">*</span>{" "}
            for the enforce group to mean "any group" (often used to forbid work
            after night shifts).
          </p>
          <ConditionalConstraintsEditor
            value={config.conditional_constraints}
            onChange={(v) => set("conditional_constraints", v)}
            shiftGroups={groups.data ?? []}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes" : "Up to date"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setConfig(initial)}>
            Discard
          </Button>
          <Button
            disabled={!dirty || update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: profileId,
                  body: { config: config as unknown as Record<string, never> },
                },
                { onSuccess: () => notify.success("Config saved") },
              )
            }
          >
            {update.isPending ? "Saving…" : "Save config"}
          </Button>
        </div>
      </div>
      <MutationError error={update.error} />
      <p className="text-xs text-muted-foreground">
        Defaults: overstaff {DEFAULT_CONFIG.weight_overstaff}, consec{" "}
        {DEFAULT_CONFIG.weight_consec}, burden {DEFAULT_CONFIG.weight_burden},
        night {DEFAULT_CONFIG.weight_night}, weekend{" "}
        {DEFAULT_CONFIG.weight_weekend}, time-limit {DEFAULT_CONFIG.time_limit}s.
      </p>
    </div>
  );
}

function NumberField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1.5"
      />
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
