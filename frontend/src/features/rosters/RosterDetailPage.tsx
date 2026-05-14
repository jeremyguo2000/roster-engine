import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RosterGrid } from "./RosterGrid";
import { RosterStatusBadge } from "./statusBadge";
import {
  useApproveRoster,
  useDeleteRoster,
  useDiscardRoster,
  useRoster,
  useRosterDemands,
} from "./hooks";
import { parseRosterResult } from "./rosterResult";
import { getApiErrorMessage } from "@/api/client";
import { minToDuration } from "@/lib/utils";
import { notify } from "@/lib/toast";

export function RosterDetailPage() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const id = idParam ? Number(idParam) : undefined;
  const numericId = id != null && Number.isFinite(id) ? id : undefined;

  const rosterQuery = useRoster(numericId);
  const demandsQuery = useRosterDemands(numericId);

  const roster = rosterQuery.data;
  const parsed = useMemo(() => parseRosterResult(roster?.result ?? null), [roster?.result]);

  const approve = useApproveRoster();
  const discard = useDiscardRoster();
  const remove = useDeleteRoster();

  // Elapsed counter for the running banner.
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (roster?.status === "running") {
      if (startedAt.current == null) startedAt.current = Date.now();
      const t = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
      }, 1_000);
      return () => clearInterval(t);
    }
    startedAt.current = null;
    setElapsed(0);
  }, [roster?.status]);

  if (rosterQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Roster" description="Loading…" />
        <Skeleton className="mb-4 h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (rosterQuery.isError || !roster) {
    return (
      <div>
        <PageHeader title="Roster" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load roster</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(rosterQuery.error, "Roster not found.")}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/rosters">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to rosters
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={roster.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <RosterStatusBadge status={roster.status} />
            <span className="font-mono">
              {format(parseISO(roster.roster_start), "yyyy-MM-dd")} · {roster.num_days} days
            </span>
            <span>target {minToDuration(roster.target_work_min)} / staff</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/rosters">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            {roster.status === "draft" && (
              <Button
                size="sm"
                disabled={approve.isPending}
                onClick={() =>
                  approve.mutate(roster.id, {
                    onSuccess: () => notify.success("Roster approved"),
                  })
                }
              >
                <Check className="mr-2 h-4 w-4" />
                {approve.isPending ? "Approving…" : "Approve"}
              </Button>
            )}
            {roster.status !== "approved" && (
              <ConfirmButton
                label="Discard"
                description="Discard this roster? The draft will be deleted and cannot be recovered."
                variant="outline"
                icon={<XCircle className="mr-2 h-4 w-4" />}
                pending={discard.isPending}
                onConfirm={() =>
                  discard.mutate(roster.id, {
                    onSuccess: () => {
                      notify.success("Roster discarded");
                      navigate("/rosters");
                    },
                  })
                }
              />
            )}
            <ConfirmButton
              label="Delete"
              description="Permanently delete this roster? This cannot be undone."
              variant="destructive"
              icon={<Trash2 className="mr-2 h-4 w-4" />}
              pending={remove.isPending}
              onConfirm={() =>
                remove.mutate(roster.id, {
                  onSuccess: () => {
                    notify.success("Roster deleted");
                    navigate("/rosters");
                  },
                })
              }
            />
          </div>
        }
      />

      {/* Status banners (action errors surface via global toasts) */}
      {roster.status === "running" && (
        <Alert variant="info" className="mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Solver is running</AlertTitle>
          <AlertDescription>
            Solving… ({elapsed}s elapsed). This page refreshes automatically.
          </AlertDescription>
        </Alert>
      )}

      {roster.status === "failed" && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Solver failed</AlertTitle>
          <AlertDescription>
            {parsed?.kind === "error"
              ? parsed.message
              : "The solver did not return a feasible result."}
          </AlertDescription>
        </Alert>
      )}

      {parsed?.kind === "invalid" && (
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unexpected result shape</AlertTitle>
          <AlertDescription>
            The backend returned a roster result we couldn't parse: {parsed.issues}
          </AlertDescription>
        </Alert>
      )}

      {/* Grid or placeholder */}
      {parsed?.kind === "ok" ? (
        <RosterGrid result={parsed.data} demands={demandsQuery.data} />
      ) : roster.status === "running" ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Waiting for solver to produce a result…
          </CardContent>
        </Card>
      ) : roster.status === "failed" ? null : (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No assignments to display.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ConfirmButtonProps {
  label: string;
  description: string;
  icon?: React.ReactNode;
  variant?: "outline" | "destructive";
  pending?: boolean;
  onConfirm: () => void;
}

function ConfirmButton({
  label,
  description,
  icon,
  variant = "outline",
  pending,
  onConfirm,
}: ConfirmButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant} disabled={pending}>
          {icon}
          {pending ? `${label}…` : label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} roster?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
