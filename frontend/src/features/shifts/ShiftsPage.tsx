import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Layers, Clock } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MutationError } from "@/components/shared/MutationError";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { minToTime, minToDuration } from "@/lib/utils";
import {
  useCreateShift,
  useCreateShiftGroup,
  useDeleteShift,
  useDeleteShiftGroup,
  useShifts,
  useShiftGroups,
  useUpdateShift,
  useUpdateShiftGroup,
} from "./hooks";
import type { components } from "@/api/schema.gen";

type ShiftGroupOut = components["schemas"]["ShiftGroupOut"];
type ShiftOut = components["schemas"]["ShiftOut"];

export function ShiftsPage() {
  return (
    <div>
      <PageHeader title="Shifts" description="Shift groups and shift definitions." />
      <Tabs defaultValue="shifts">
        <TabsList>
          <TabsTrigger value="shifts">
            <Clock className="mr-2 h-4 w-4" />
            Shifts
          </TabsTrigger>
          <TabsTrigger value="groups">
            <Layers className="mr-2 h-4 w-4" />
            Groups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="shifts">
          <ShiftsTab />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- Shifts ------------------------------- */

function ShiftsTab() {
  const shifts = useShifts();
  const groups = useShiftGroups();
  const groupById = useMemo(() => {
    const m = new Map<number, ShiftGroupOut>();
    for (const g of groups.data ?? []) m.set(g.id, g);
    return m;
  }, [groups.data]);

  const deleteShift = useDeleteShift();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ShiftDialog
          mode="create"
          groups={groups.data ?? []}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New shift
            </Button>
          }
        />
      </div>
      {shifts.isLoading ? (
        <Skeleton className="h-40" />
      ) : (shifts.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Clock className="h-5 w-5" />}
          title="No shifts yet"
          description="Define shifts (e.g. D=Day 0700–1500) before assigning them to staff or profiles."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Work</TableHead>
                <TableHead>Break</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(shifts.data ?? []).map((s) => {
                const g = groupById.get(s.group_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono font-medium">{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>
                      {g ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline" className="font-mono">{g.code}</Badge>
                          {g.is_night_shift && <Badge variant="muted">night</Badge>}
                          {!g.is_work_shift && <Badge variant="warning">leave</Badge>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">#{s.group_id}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {minToTime(s.start_min)} – {minToTime(s.end_min)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {minToDuration(s.work_min)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.break_min ? minToDuration(s.break_min) : "—"}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <ShiftDialog
                        mode="edit"
                        groups={groups.data ?? []}
                        existing={s}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit shift">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Delete shift">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title={`Delete shift "${s.code}"?`}
                        description="The shift can't be deleted while it's assigned to staff or profiles."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => deleteShift.mutate(s.id)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <MutationError error={deleteShift.error} />
    </div>
  );
}

interface ShiftDialogProps {
  mode: "create" | "edit";
  groups: ShiftGroupOut[];
  existing?: ShiftOut;
  trigger: React.ReactNode;
}

function ShiftDialog({ mode, groups, existing, trigger }: ShiftDialogProps) {
  const create = useCreateShift();
  const update = useUpdateShift();
  const mutating = mode === "create" ? create : update;

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [groupId, setGroupId] = useState<number | null>(existing?.group_id ?? null);
  const [startMin, setStartMin] = useState(existing?.start_min ?? 420);
  const [endMin, setEndMin] = useState(existing?.end_min ?? 900);
  const [workMin, setWorkMin] = useState(existing?.work_min ?? 480);
  const [breakMin, setBreakMin] = useState(existing?.break_min ?? 0);

  function reset() {
    setCode(existing?.code ?? "");
    setName(existing?.name ?? "");
    setGroupId(existing?.group_id ?? null);
    setStartMin(existing?.start_min ?? 420);
    setEndMin(existing?.end_min ?? 900);
    setWorkMin(existing?.work_min ?? 480);
    setBreakMin(existing?.break_min ?? 0);
    create.reset();
    update.reset();
  }

  const valid = code.trim() && name.trim() && groupId != null && workMin >= 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New shift" : `Edit ${existing?.code}`}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            const body = {
              group_id: groupId!,
              code: code.trim(),
              name: name.trim(),
              start_min: startMin,
              end_min: endMin,
              work_min: workMin,
              break_min: breakMin,
            };
            if (mode === "create") {
              create.mutate(body, { onSuccess: () => setOpen(false) });
            } else {
              update.mutate(
                { id: existing!.id, body },
                { onSuccess: () => setOpen(false) },
              );
            }
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="shift-code">Code</Label>
              <Input
                id="shift-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="shift-group">Group</Label>
              <Select
                value={groupId != null ? String(groupId) : undefined}
                onValueChange={(v) => setGroupId(Number(v))}
              >
                <SelectTrigger id="shift-group" className="mt-1.5">
                  <SelectValue placeholder="Pick a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="shift-name">Name</Label>
              <Input
                id="shift-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="shift-start">Start (min)</Label>
              <Input
                id="shift-start"
                type="number"
                min={0}
                max={1439}
                value={startMin}
                onChange={(e) => setStartMin(Number(e.target.value) || 0)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">{minToTime(startMin)}</p>
            </div>
            <div>
              <Label htmlFor="shift-end">End (min)</Label>
              <Input
                id="shift-end"
                type="number"
                min={0}
                max={1439}
                value={endMin}
                onChange={(e) => setEndMin(Number(e.target.value) || 0)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">{minToTime(endMin)}</p>
            </div>
            <div>
              <Label htmlFor="shift-work">Work (min)</Label>
              <Input
                id="shift-work"
                type="number"
                min={0}
                value={workMin}
                onChange={(e) => setWorkMin(Number(e.target.value) || 0)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">{minToDuration(workMin)}</p>
            </div>
            <div>
              <Label htmlFor="shift-break">Break (min)</Label>
              <Input
                id="shift-break"
                type="number"
                min={0}
                value={breakMin}
                onChange={(e) => setBreakMin(Number(e.target.value) || 0)}
                className="mt-1.5"
              />
            </div>
          </div>
          <MutationError error={mutating.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || mutating.isPending}>
              {mutating.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Groups ------------------------------- */

function GroupsTab() {
  const groups = useShiftGroups();
  const deleteGroup = useDeleteShiftGroup();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <GroupDialog
          mode="create"
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New group
            </Button>
          }
        />
      </div>
      {groups.isLoading ? (
        <Skeleton className="h-40" />
      ) : (groups.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title="No shift groups yet"
          description="Group shifts by purpose (e.g. DAY, NIGHT, AL) — colour and behaviour are derived from these."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groups.data ?? []).map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono font-medium">{g.code}</TableCell>
                    <TableCell className="space-x-1">
                      {g.is_work_shift ? (
                        <Badge variant="success">work</Badge>
                      ) : (
                        <Badge variant="warning">leave</Badge>
                      )}
                      {g.is_night_shift && <Badge variant="muted">night</Badge>}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <GroupDialog
                        mode="edit"
                        existing={g}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit group">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Delete group">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title={`Delete group "${g.code}"?`}
                        description="The group must contain no shifts to be deleted."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => deleteGroup.mutate(g.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <MutationError error={deleteGroup.error} />
    </div>
  );
}

interface GroupDialogProps {
  mode: "create" | "edit";
  existing?: ShiftGroupOut;
  trigger: React.ReactNode;
}

function GroupDialog({ mode, existing, trigger }: GroupDialogProps) {
  const create = useCreateShiftGroup();
  const update = useUpdateShiftGroup();
  const mutating = mode === "create" ? create : update;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(existing?.code ?? "");
  const [isWork, setIsWork] = useState(existing?.is_work_shift ?? true);
  const [isNight, setIsNight] = useState(existing?.is_night_shift ?? false);

  function reset() {
    setCode(existing?.code ?? "");
    setIsWork(existing?.is_work_shift ?? true);
    setIsNight(existing?.is_night_shift ?? false);
    create.reset();
    update.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New shift group" : `Edit ${existing?.code}`}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim()) return;
            const body = { code: code.trim(), is_work_shift: isWork, is_night_shift: isNight };
            if (mode === "create") {
              create.mutate(body, { onSuccess: () => setOpen(false) });
            } else {
              update.mutate(
                { id: existing!.id, body },
                { onSuccess: () => setOpen(false) },
              );
            }
          }}
        >
          <div>
            <Label htmlFor="group-code">Code</Label>
            <Input
              id="group-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1.5 font-mono"
              placeholder="e.g. DAY"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="group-work">Counts as work</Label>
            <Switch id="group-work" checked={isWork} onCheckedChange={setIsWork} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="group-night">Night shift</Label>
            <Switch id="group-night" checked={isNight} onCheckedChange={setIsNight} />
          </div>
          <MutationError error={mutating.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!code.trim() || mutating.isPending}>
              {mutating.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
