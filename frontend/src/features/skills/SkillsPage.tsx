import { useState } from "react";
import { Plus, Trash2, Pencil, Tag } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MutationError } from "@/components/shared/MutationError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  useAddSkillValue,
  useCreateSkillType,
  useDeleteSkillType,
  useDeleteSkillValue,
  useSkillTypes,
  useUpdateSkillType,
} from "./hooks";
import type { components } from "@/api/schema.gen";

type SkillTypeOut = components["schemas"]["SkillTypeOut"];

export function SkillsPage() {
  const skillTypes = useSkillTypes();

  return (
    <div>
      <PageHeader
        title="Skills"
        description="Skill types and values used to filter demand coverage."
        actions={<CreateTypeDialog />}
      />

      {skillTypes.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : skillTypes.data && skillTypes.data.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-5 w-5" />}
          title="No skill types yet"
          description="Create a skill type (e.g. Certification, Language) to start tracking who has what."
          action={<CreateTypeDialog />}
        />
      ) : (
        <div className="space-y-4">
          {(skillTypes.data ?? []).map((t) => (
            <SkillTypeCard key={t.id} type={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillTypeCard({ type }: { type: SkillTypeOut }) {
  const addValue = useAddSkillValue();
  const deleteValue = useDeleteSkillValue();
  const deleteType = useDeleteSkillType();
  const [newValue, setNewValue] = useState("");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>{type.name}</CardTitle>
          {type.description && (
            <p className="mt-1 text-sm text-muted-foreground">{type.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <EditTypeDialog type={type} />
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label="Delete skill type">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title={`Delete "${type.name}"?`}
            description="This cannot be undone. The skill type must have no values to be deleted."
            confirmLabel="Delete"
            destructive
            onConfirm={() => deleteType.mutate(type.id)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {type.values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {type.values.map((v) => (
              <Badge key={v.id} variant="secondary" className="gap-1.5 pr-1">
                {v.value}
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-background/60"
                      aria-label={`Remove ${v.value}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  }
                  title={`Delete value "${v.value}"?`}
                  description="The value cannot be deleted if it's assigned to any staff or referenced by demands."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => deleteValue.mutate({ typeId: type.id, valueId: v.id })}
                />
              </Badge>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newValue.trim()) return;
            addValue.mutate(
              { typeId: type.id, body: { value: newValue.trim() } },
              { onSuccess: () => setNewValue("") },
            );
          }}
        >
          <Input
            value={newValue}
            placeholder="Add value…"
            onChange={(e) => setNewValue(e.target.value)}
          />
          <Button type="submit" disabled={!newValue.trim() || addValue.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </form>
        <MutationError error={addValue.error ?? deleteValue.error ?? deleteType.error} />
      </CardContent>
    </Card>
  );
}

function CreateTypeDialog() {
  const create = useCreateSkillType();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setName("");
          setDescription("");
          create.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New skill type
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New skill type</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              { name: name.trim(), description: description.trim() || null },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <div>
            <Label htmlFor="skill-type-name">Name</Label>
            <Input
              id="skill-type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="skill-type-desc">Description</Label>
            <Textarea
              id="skill-type-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5"
            />
          </div>
          <MutationError error={create.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTypeDialog({ type }: { type: SkillTypeOut }) {
  const update = useUpdateSkillType();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(type.name);
          setDescription(type.description ?? "");
          update.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Edit skill type">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit "{type.name}"</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              {
                id: type.id,
                body: { name: name.trim(), description: description.trim() || null },
              },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5"
            />
          </div>
          <MutationError error={update.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
