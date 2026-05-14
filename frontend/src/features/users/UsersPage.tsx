import { useState } from "react";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MutationError } from "@/components/shared/MutationError";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useChangePassword, useCreateUser, useDeleteUser, useUsers } from "./hooks";
import { useCurrentUser } from "@/features/auth/useAuth";

export function UsersPage() {
  const users = useUsers();
  const me = useCurrentUser();
  const remove = useDeleteUser();

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage user accounts and change your password."
        actions={
          <div className="flex gap-2">
            <ChangePasswordDialog />
            <CreateUserDialog />
          </div>
        }
      />

      {users.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data ?? []).map((u) => {
                  const isMe = u.id === me.data?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.username}{" "}
                        {isMe && <Badge variant="outline" className="ml-1">you</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {format(parseISO(u.created_at), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isMe && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Delete user">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                            title={`Delete user "${u.username}"?`}
                            description="This cannot be undone."
                            confirmLabel="Delete"
                            destructive
                            onConfirm={() => remove.mutate(u.id)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <MutationError error={remove.error} />
    </div>
  );
}

function CreateUserDialog() {
  const create = useCreateUser();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function reset() {
    setUsername("");
    setPassword("");
    create.reset();
  }

  const valid = username.trim().length >= 3 && password.length >= 6;

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
          New user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            create.mutate(
              { username: username.trim(), password },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <div>
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">3–50 characters.</p>
          </div>
          <div>
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">Minimum 6 characters.</p>
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

function ChangePasswordDialog() {
  const change = useChangePassword();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setSuccess(false);
    change.reset();
  }

  const valid = current && next.length >= 6 && next === confirm;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRound className="mr-2 h-4 w-4" />
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change your password</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            change.mutate(
              { current_password: current, new_password: next },
              { onSuccess: () => setSuccess(true) },
            );
          }}
        >
          <div>
            <Label htmlFor="cp-cur">Current password</Label>
            <Input
              id="cp-cur"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cp-new">New password</Label>
            <Input
              id="cp-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">Minimum 6 characters.</p>
          </div>
          <div>
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5"
            />
            {confirm && next !== confirm && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>
          {success ? (
            <Alert variant="info">
              <AlertDescription>Password changed successfully.</AlertDescription>
            </Alert>
          ) : (
            <MutationError error={change.error} />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={!valid || change.isPending}>
              {change.isPending ? "Saving…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
