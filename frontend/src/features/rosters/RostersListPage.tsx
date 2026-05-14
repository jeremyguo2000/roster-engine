import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { useProfiles, useRosters, type RosterFilters } from "./hooks";
import { RosterStatusBadge } from "./statusBadge";
import { getApiErrorMessage } from "@/api/client";
import type { components } from "@/api/schema.gen";

type RosterStatus = components["schemas"]["RosterStatus"];
type RosterOut = components["schemas"]["RosterOut"];

type SortKey = "name" | "status" | "roster_start" | "num_days" | "profile";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS: Array<{ value: RosterStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "failed", label: "Failed" },
];

const PAGE_SIZE = 20;

export function RostersListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<RosterStatus | "all">("all");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("roster_start");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const filters: RosterFilters = useMemo(() => {
    const f: RosterFilters = {};
    if (statusFilter !== "all") f.status = statusFilter;
    if (profileFilter !== "all") f.profileId = Number(profileFilter);
    return f;
  }, [statusFilter, profileFilter]);

  const profilesQuery = useProfiles();
  const rostersQuery = useRosters(filters);

  const profileNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of profilesQuery.data ?? []) map.set(p.id, p.name);
    return map;
  }, [profilesQuery.data]);

  const filtered = useMemo(() => {
    const items = rostersQuery.data ?? [];
    if (!search.trim()) return items;
    const needle = search.trim().toLowerCase();
    return items.filter((r) => r.name.toLowerCase().includes(needle));
  }, [rostersQuery.data, search]);

  const sorted = useMemo(() => {
    const items = [...filtered];
    items.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "num_days":
          return (a.num_days - b.num_days) * dir;
        case "profile": {
          const an = profileNameById.get(a.profile_id) ?? "";
          const bn = profileNameById.get(b.profile_id) ?? "";
          return an.localeCompare(bn) * dir;
        }
        case "roster_start":
        default:
          return a.roster_start.localeCompare(b.roster_start) * dir;
      }
    });
    return items;
  }, [filtered, sortKey, sortDir, profileNameById]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "roster_start" ? "desc" : "asc");
    }
    setPage(0);
  }

  return (
    <div>
      <PageHeader
        title="Rosters"
        description="Browse, filter, and approve rosters."
        actions={
          <Button asChild>
            <Link to="/rosters/new">
              <Plus className="mr-2 h-4 w-4" />
              Generate roster
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as RosterStatus | "all");
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Profile
            </label>
            <Select
              value={profileFilter}
              onValueChange={(v) => {
                setProfileFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All profiles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All profiles</SelectItem>
                {(profilesQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <Input
              placeholder="Filter by name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
      </Card>

      {rostersQuery.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load rosters</AlertTitle>
          <AlertDescription>{getApiErrorMessage(rostersQuery.error)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Name"
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => toggleSort("name")}
              />
              <SortableHead
                label="Status"
                active={sortKey === "status"}
                dir={sortDir}
                onClick={() => toggleSort("status")}
              />
              <SortableHead
                label="Profile"
                active={sortKey === "profile"}
                dir={sortDir}
                onClick={() => toggleSort("profile")}
              />
              <SortableHead
                label="Start"
                active={sortKey === "roster_start"}
                dir={sortDir}
                onClick={() => toggleSort("roster_start")}
              />
              <SortableHead
                label="Days"
                active={sortKey === "num_days"}
                dir={sortDir}
                onClick={() => toggleSort("num_days")}
                className="w-24"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rostersQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <RosterRowSkeleton key={i} />)
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  No rosters match these filters.
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((r) => (
                <RosterRow
                  key={r.id}
                  roster={r}
                  profileName={profileNameById.get(r.profile_id) ?? `#${r.profile_id}`}
                  onClick={() => navigate(`/rosters/${r.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {sorted.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SortableHeadProps {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}

function SortableHead({ label, active, dir, onClick, className }: SortableHeadProps) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

function RosterRow({
  roster,
  profileName,
  onClick,
}: {
  roster: RosterOut;
  profileName: string;
  onClick: () => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onClick}>
      <TableCell className="font-medium">{roster.name}</TableCell>
      <TableCell>
        <RosterStatusBadge status={roster.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">{profileName}</TableCell>
      <TableCell className="font-mono text-xs">
        {format(parseISO(roster.roster_start), "yyyy-MM-dd")}
      </TableCell>
      <TableCell className="font-mono text-xs">{roster.num_days}</TableCell>
    </TableRow>
  );
}

function RosterRowSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
    </TableRow>
  );
}
