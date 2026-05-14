import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MutationError } from "@/components/shared/MutationError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  useAddPermittedShift,
  useAddStaffSkill,
  useCreateLeave,
  useDeleteLeave,
  useLeaves,
  usePermittedShifts,
  useRemovePermittedShift,
  useRemoveStaffSkill,
  useStaff,
  useStaffGroups,
  useStaffSkills,
  useUpdateStaff,
} from "./hooks";
import { useShifts } from "@/features/shifts/hooks";
import { useSkillTypes } from "@/features/skills/hooks";
import { getApiErrorMessage } from "@/api/client";

export function StaffDetailPage() {
  const { id: idParam } = useParams();
  const id = idParam ? Number(idParam) : undefined;
  const numericId = id != null && Number.isFinite(id) ? id : undefined;
  const staff = useStaff(numericId);

  if (staff.isLoading) {
    return (
      <div>
        <PageHeader title="Staff" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (staff.isError || !staff.data) {
    return (
      <div>
        <PageHeader title="Staff" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load staff</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(staff.error, "Staff not found.")}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/staff">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  const s = staff.data;

  return (
    <div>
      <PageHeader
        title={s.full_name}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-xs">{s.employee_id}</span>
            <Badge variant="muted">{s.staff_group.name}</Badge>
            {s.deleted && <Badge variant="destructive">deleted</Badge>}
          </span>
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/staff">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <ProfileCard staffId={s.id} />
        <Tabs defaultValue="skills">
          <TabsList>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="permitted">Permitted shifts</TabsTrigger>
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
          </TabsList>
          <TabsContent value="skills">
            <SkillsTab staffId={s.id} />
          </TabsContent>
          <TabsContent value="permitted">
            <PermittedShiftsTab staffId={s.id} />
          </TabsContent>
          <TabsContent value="leaves">
            <LeavesTab staffId={s.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* --------------------------- Editable info card --------------------------- */

function ProfileCard({ staffId }: { staffId: number }) {
  const staff = useStaff(staffId);
  const groups = useStaffGroups();
  const update = useUpdateStaff();

  const [employeeId, setEmployeeId] = useState(staff.data?.employee_id ?? "");
  const [fullName, setFullName] = useState(staff.data?.full_name ?? "");
  const [groupId, setGroupId] = useState<string>(String(staff.data?.staff_group_id ?? ""));
  const [editing, setEditing] = useState(false);

  const dirty =
    editing &&
    staff.data &&
    (employeeId !== staff.data.employee_id ||
      fullName !== staff.data.full_name ||
      groupId !== String(staff.data.staff_group_id));

  function startEdit() {
    if (!staff.data) return;
    setEmployeeId(staff.data.employee_id);
    setFullName(staff.data.full_name);
    setGroupId(String(staff.data.staff_group_id));
    setEditing(true);
    update.reset();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Profile</CardTitle>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!dirty || update.isPending}
              onClick={() =>
                update.mutate(
                  {
                    id: staffId,
                    body: {
                      employee_id: employeeId.trim(),
                      full_name: fullName.trim(),
                      staff_group_id: Number(groupId),
                    },
                  },
                  { onSuccess: () => setEditing(false) },
                )
              }
            >
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Employee ID</Label>
          {editing ? (
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="mt-1.5 font-mono"
            />
          ) : (
            <p className="mt-2 font-mono">{staff.data?.employee_id}</p>
          )}
        </div>
        <div>
          <Label>Full name</Label>
          {editing ? (
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5"
            />
          ) : (
            <p className="mt-2">{staff.data?.full_name}</p>
          )}
        </div>
        <div>
          <Label>Group</Label>
          {editing ? (
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="mt-2">{staff.data?.staff_group.name}</p>
          )}
        </div>
        {editing && (
          <div className="sm:col-span-3">
            <MutationError error={update.error} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Skills tab -------------------------------- */

function SkillsTab({ staffId }: { staffId: number }) {
  const skills = useStaffSkills(staffId);
  const skillTypes = useSkillTypes();
  const add = useAddStaffSkill();
  const remove = useRemoveStaffSkill();
  const [pickValue, setPickValue] = useState<string>("");

  const allOptions = useMemo(
    () =>
      (skillTypes.data ?? []).flatMap((t) =>
        t.values.map((v) => ({ id: v.id, label: `${t.name}: ${v.value}` })),
      ),
    [skillTypes.data],
  );

  const assigned = new Set((skills.data ?? []).map((s) => s.skill_value_id));
  const available = allOptions.filter((o) => !assigned.has(o.id));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {skills.isLoading ? (
          <Skeleton className="h-20" />
        ) : (skills.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(skills.data ?? []).map((s) => (
              <Badge key={s.skill_value_id} variant="secondary" className="gap-1.5 pr-1">
                {s.skill_type}: {s.value}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background/60"
                  onClick={() =>
                    remove.mutate({ staffId, skillValueId: s.skill_value_id })
                  }
                  aria-label="Remove skill"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {available.length > 0 ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pickValue) return;
              add.mutate(
                { staffId, skillValueId: Number(pickValue) },
                { onSuccess: () => setPickValue("") },
              );
            }}
          >
            <Select value={pickValue} onValueChange={setPickValue}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose a skill value to add" />
              </SelectTrigger>
              <SelectContent>
                {available.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!pickValue || add.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            All available skill values are already assigned.
          </p>
        )}
        <MutationError error={add.error ?? remove.error} />
      </CardContent>
    </Card>
  );
}

/* ---------------------------- Permitted shifts ---------------------------- */

function PermittedShiftsTab({ staffId }: { staffId: number }) {
  const permitted = usePermittedShifts(staffId);
  const shifts = useShifts();
  const add = useAddPermittedShift();
  const remove = useRemovePermittedShift();
  const [pickShift, setPickShift] = useState<string>("");

  const assigned = new Set(
    (permitted.data?.permitted_shifts ?? []).map((p) => p.shift_id),
  );
  const available = (shifts.data ?? []).filter((s) => !assigned.has(s.id));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm text-muted-foreground">{permitted.data?.note}</p>
        {permitted.isLoading ? (
          <Skeleton className="h-20" />
        ) : (permitted.data?.permitted_shifts.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No restrictions — add at least one shift here to restrict this staff
            to a subset.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {permitted.data!.permitted_shifts.map((p) => (
              <Badge key={p.shift_id} variant="secondary" className="gap-1.5 pr-1">
                <span className="font-mono">{p.shift_code}</span>
                <span className="text-xs text-muted-foreground">{p.shift_name}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background/60"
                  onClick={() => remove.mutate({ staffId, shiftId: p.shift_id })}
                  aria-label="Remove permitted shift"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {available.length > 0 && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pickShift) return;
              add.mutate(
                { staffId, shiftId: Number(pickShift) },
                { onSuccess: () => setPickShift("") },
              );
            }}
          >
            <Select value={pickShift} onValueChange={setPickShift}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose a shift to permit" />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.code} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!pickShift || add.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </form>
        )}
        <MutationError error={add.error ?? remove.error} />
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Leaves tab -------------------------------- */

function LeavesTab({ staffId }: { staffId: number }) {
  const leaves = useLeaves({ staffId });
  const create = useCreateLeave();
  const remove = useDeleteLeave();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftCode, setShiftCode] = useState("AL");
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_120px_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            create.mutate(
              {
                staff_id: staffId,
                date,
                shift_code: shiftCode || "AL",
                note: note.trim() || null,
              },
              { onSuccess: () => setNote("") },
            );
          }}
        >
          <div>
            <Label htmlFor="leave-date">Date</Label>
            <Input
              id="leave-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="leave-code">Code</Label>
            <Input
              id="leave-code"
              value={shiftCode}
              onChange={(e) => setShiftCode(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="leave-note">Note</Label>
            <Input
              id="leave-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </form>
        <MutationError error={create.error ?? remove.error} />
        {leaves.isLoading ? (
          <Skeleton className="h-20" />
        ) : (leaves.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No leaves recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leaves.data ?? []).map((lv) => (
                <TableRow key={lv.id}>
                  <TableCell className="font-mono text-xs">
                    {format(parseISO(lv.date), "yyyy-MM-dd EEE")}
                  </TableCell>
                  <TableCell className="font-mono">{lv.shift_code}</TableCell>
                  <TableCell className="text-muted-foreground">{lv.note ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Delete leave">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                      title="Delete leave?"
                      description="The leave will no longer be applied as a pre-assignment."
                      confirmLabel="Delete"
                      destructive
                      onConfirm={() => remove.mutate(lv.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
