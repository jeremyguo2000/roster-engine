import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent } from "@/components/ui/card";
import type { ConditionalConstraint } from "./profileConfig";
import type { components } from "@/api/schema.gen";

type ShiftGroupOut = components["schemas"]["ShiftGroupOut"];

interface Props {
  value: ConditionalConstraint[];
  onChange: (next: ConditionalConstraint[]) => void;
  shiftGroups: ShiftGroupOut[];
}

const WILDCARD = "*";

/**
 * Structured editor for the `conditional_constraints` array in
 * `Profile.config`. Each row models a rule like
 * "if {trigger}={trigger_val} on day d, then on day d+offset
 *  enforce {enforce}={enforce_val}". `enforce: "*"` means any group.
 */
export function ConditionalConstraintsEditor({ value, onChange, shiftGroups }: Props) {
  const update = (i: number, patch: Partial<ConditionalConstraint>) =>
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const add = () =>
    onChange([
      ...value,
      {
        trigger: shiftGroups[0]?.code ?? "",
        trigger_val: 1,
        offset: 1,
        enforce: WILDCARD,
        enforce_val: 0,
      },
    ]);

  return (
    <Card>
      <CardContent className="p-0">
        {value.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No conditional constraints. Add one to enforce cross-day rules
            like "no day shift after a night shift".
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger group</TableHead>
                <TableHead className="w-24">Trigger val</TableHead>
                <TableHead className="w-24">Offset</TableHead>
                <TableHead>Enforce group</TableHead>
                <TableHead className="w-24">Enforce val</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select
                      value={c.trigger}
                      onValueChange={(v) => update(i, { trigger: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {shiftGroups.map((g) => (
                          <SelectItem key={g.id} value={g.code}>
                            {g.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={c.trigger_val}
                      onChange={(e) => update(i, { trigger_val: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={c.offset}
                      onChange={(e) => update(i, { offset: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.enforce}
                      onValueChange={(v) => update(i, { enforce: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={WILDCARD}>* (any)</SelectItem>
                        {shiftGroups.map((g) => (
                          <SelectItem key={g.id} value={g.code}>
                            {g.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={c.enforce_val}
                      onChange={(e) => update(i, { enforce_val: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(i)}
                      aria-label="Remove constraint"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex justify-end border-t p-3">
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="mr-2 h-4 w-4" />
            Add constraint
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
