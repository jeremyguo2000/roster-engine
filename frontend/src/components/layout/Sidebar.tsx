import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  Users,
  Settings2,
  Clock,
  GraduationCap,
  ClipboardList,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof CalendarDays;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rosters", label: "Rosters", icon: ListChecks },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/profiles", label: "Profiles", icon: Settings2 },
  { to: "/shifts", label: "Shifts", icon: Clock },
  { to: "/skills", label: "Skills", icon: GraduationCap },
  { to: "/demands", label: "Demands", icon: ClipboardList },
  { to: "/users", label: "Users", icon: UserCog },
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <CalendarDays className="h-5 w-5 text-primary" />
        <span className="font-serif text-lg">Roster Engine</span>
      </div>
      <nav className="space-y-1 p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
