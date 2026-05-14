import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  CalendarRange,
  Clock,
  LayoutDashboard,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Tag,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLogout } from "@/features/auth/useAuth";

const NAV: Array<{
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Rosters", to: "/rosters", icon: CalendarRange },
  { label: "Staff", to: "/staff", icon: UserRound },
  { label: "Staff groups", to: "/staff/groups", icon: Users },
  { label: "Profiles", to: "/profiles", icon: Users },
  { label: "Shifts", to: "/shifts", icon: Clock },
  { label: "Skills", to: "/skills", icon: Tag },
  { label: "Demands", to: "/demands", icon: CalendarRange },
  { label: "Users", to: "/users", icon: UserCog },
];

/**
 * Cmd+K (or Ctrl+K) command palette. Mounted once inside AppShell so the
 * keyboard listener is only active when the user is signed in.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const logout = useLogout();
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    // Defer so the dialog close animation doesn't trip route transitions.
    queueMicrotask(fn);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <Command>
          <CommandInput placeholder="Type a command or search…" autoFocus />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Navigate">
              {NAV.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`go ${item.label} ${item.to}`}
                  onSelect={() => run(() => navigate(item.to))}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem
                value="generate roster new"
                onSelect={() => run(() => navigate("/rosters/new"))}
              >
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                Generate new roster
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem
                value={`theme ${resolvedTheme === "dark" ? "light" : "dark"}`}
                onSelect={() =>
                  run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))
                }
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                )}
                Toggle {resolvedTheme === "dark" ? "light" : "dark"} mode
              </CommandItem>
              <CommandItem value="sign out logout" onSelect={() => run(() => logout())}>
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
