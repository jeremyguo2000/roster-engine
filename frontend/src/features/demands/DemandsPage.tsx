import { useMemo, useState } from "react";
import { Plus, CalendarRange } from "lucide-react";
import { addDays, format } from "date-fns";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { minToTime } from "@/lib/utils";
import { useCreateDemand, useDemands } from "./hooks";
import { useSkillTypes } from "@/features/skills/hooks";

const DEFAULT_FROM = format(new Date(), "yyyy-MM-dd");
const DEFAULT_TO = format(addDays(new Date(), 30), "yyyy-MM-dd");

export function DemandsPage() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [skillFilter, setSkillFilter] = useState<string>("all");

  const skillFilterId = skillFilter === "all" ? undefined : Number(skillFilter);
  const demands = useDemands({ from, to, skillValueId: skillFilterId });

  return (
    <div>
      <PageHeader
        title="Demands"
        description="Date-specific staffing demands. Link them to a roster from the generate wizard."
        actions={<CreateDemandDialog />}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Skill value</Label>
            <SkillFilter value={skillFilter} onChange={setSkillFilter} />
          </div>
        </div>
      </Card>

      {demands.isLoading ? (
        <Skeleton className="h-40" />
      ) : (demands.data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-5 w-5" />}
          title="No demands in this window"
          description="Create demands here, then attach them to a roster from the generate wizard."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Headcount</TableHead>
                  <TableHead>Skill value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(demands.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.date}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {minToTime(d.start_min)} – {minToTime(d.end_min)}
                    </TableCell>
                    <TableCell className="font-mono">{d.headcount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.skill_value_id != null ? `#${d.skill_value_id}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SkillFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const skillTypes = useSkillTypes();
  const allValues = useMemo(
    () => (skillTypes.data ?? []).flatMap((t) => t.values.map((v) => ({ ...v, type: t.name }))),
    [skillTypes.data],
  );
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {allValues.map((v) => (
          <SelectItem key={v.id} value={String(v.id)}>
            {v.type}: {v.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateDemandDialog() {
  const create = useCreateDemand();
  const skillTypes = useSkillTypes();
  const allValues = useMemo(
    () => (skillTypes.data ?? []).flatMap((t) => t.values.map((v) => ({ ...v, type: t.name }))),
    [skillTypes.data],
  );

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startMin, setStartMin] = useState(420);
  const [endMin, setEndMin] = useState(900);
  const [headcount, setHeadcount] = useState(1);
  const [skillValueId, setSkillValueId] = useState<string>("none");

  function reset() {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStartMin(420);
    setEndMin(900);
    setHeadcount(1);
    setSkillValueId("none");
    create.reset();
  }

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
          New demand
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New demand</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (headcount < 1) return;
            create.mutate(
              {
                date,
                start_min: startMin,
                end_min: endMin,
                headcount,
                skill_value_id: skillValueId === "none" ? null : Number(skillValueId),
              },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <div>
            <Label htmlFor="d-date">Date</Label>
            <Input
              id="d-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="d-start">Start (min)</Label>
              <Input
                id="d-start"
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
              <Label htmlFor="d-end">End (min)</Label>
              <Input
                id="d-end"
                type="number"
                min={0}
                max={1439}
                value={endMin}
                onChange={(e) => setEndMin(Number(e.target.value) || 0)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">{minToTime(endMin)}</p>
            </div>
          </div>
          <div>
            <Label htmlFor="d-head">Headcount</Label>
            <Input
              id="d-head"
              type="number"
              min={1}
              value={headcount}
              onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Skill value (optional)</Label>
            <Select value={skillValueId} onValueChange={setSkillValueId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No skill restriction</SelectItem>
                {allValues.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.type}: {v.value}
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
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
