import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MutationError } from "@/components/shared/MutationError";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateStaffGroup,
  useDeleteStaffGroup,
  useStaffGroups,
  useUpdateStaffGroup,
} from "./hooks";
import type { components } from "@/api/schema.gen";

type StaffGroupOut = components["schemas"]["StaffGroupOut"];

export function StaffGroupsPage() {
  const groups = useStaffGroups();
  const deleteGroup = useDeleteStaffGroup();

  return (
    <div>
      <PageHeader
        title="Staff groups"
        description="Organise staff into groups for bulk operations."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/staff">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Staff
              </Link>
            </Button>
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
        }
      />

      {groups.isLoading ? (
        <Skeleton className="h-40" />
      ) : (groups.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No staff groups yet"
          description="Create a group like 'Nurses' or 'Doctors' so you can bulk-add them to profiles."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groups.data ?? []).map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
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
                        title={`Delete group "${g.name}"?`}
                        description="The group must contain no staff to be deleted."
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
  existing?: StaffGroupOut;
  trigger: React.ReactNode;
}

function GroupDialog({ mode, existing, trigger }: GroupDialogProps) {
  const create = useCreateStaffGroup();
  const update = useUpdateStaffGroup();
  const mutating = mode === "create" ? create : update;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(existing?.name ?? "");
          create.reset();
          update.reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New staff group" : `Edit ${existing?.name}`}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const body = { name: name.trim() };
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
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              autoFocus
            />
          </div>
          <MutationError error={mutating.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || mutating.isPending}>
              {mutating.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
