import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, RotateCcw, Users, Search } from "lucide-react";

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
import {
  useCreateStaff,
  useRestoreStaff,
  useSoftDeleteStaff,
  useStaffGroups,
  useStaffList,
} from "./hooks";

export function StaffListPage() {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [search, setSearch] = useState("");

  const groups = useStaffGroups();
  const staff = useStaffList({
    groupId: groupFilter === "all" ? undefined : Number(groupFilter),
    includeDeleted,
  });

  const filtered = useMemo(() => {
    const items = staff.data ?? [];
    if (!search.trim()) return items;
    const needle = search.trim().toLowerCase();
    return items.filter(
      (s) =>
        s.full_name.toLowerCase().includes(needle) ||
        s.employee_id.toLowerCase().includes(needle),
    );
  }, [staff.data, search]);

  const softDelete = useSoftDeleteStaff();
  const restore = useRestoreStaff();

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Manage staff, skills, permitted shifts and leaves."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/staff/groups">
                <Users className="mr-2 h-4 w-4" />
                Groups
              </Link>
            </Button>
            <CreateStaffDialog />
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Group</Label>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Search</Label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or employee ID…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="include-deleted" className="cursor-pointer">
              Include deleted
            </Label>
            <Switch
              id="include-deleted"
              checked={includeDeleted}
              onCheckedChange={setIncludeDeleted}
            />
          </div>
        </div>
      </Card>

      {staff.isLoading ? (
        <Skeleton className="h-40" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No staff match these filters"
          description="Adjust filters or create a new staff member."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.employee_id}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/staff/${s.id}`} className="hover:underline">
                        {s.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.staff_group.name}
                    </TableCell>
                    <TableCell>
                      {s.deleted ? (
                        <Badge variant="muted">deleted</Badge>
                      ) : (
                        <Badge variant="success">active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {s.deleted ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Restore staff">
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          }
                          title={`Restore ${s.full_name}?`}
                          description="They will be eligible for new rosters again."
                          confirmLabel="Restore"
                          onConfirm={() => restore.mutate(s.id)}
                        />
                      ) : (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Soft delete staff">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={`Soft-delete ${s.full_name}?`}
                          description="They remain in historical rosters but won't be picked for new ones. You can restore them later."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => softDelete.mutate(s.id)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <MutationError error={softDelete.error ?? restore.error} />
    </div>
  );
}

function CreateStaffDialog() {
  const create = useCreateStaff();
  const groups = useStaffGroups();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [groupId, setGroupId] = useState<string>("");

  function reset() {
    setEmployeeId("");
    setFullName("");
    setGroupId("");
    create.reset();
  }

  const valid = employeeId.trim() && fullName.trim() && groupId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New staff</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            create.mutate(
              {
                employee_id: employeeId.trim(),
                full_name: fullName.trim(),
                staff_group_id: Number(groupId),
              },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="emp-id">Employee ID</Label>
              <Input
                id="emp-id"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Pick a group" />
              </SelectTrigger>
              <SelectContent>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MutationError error={create.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
