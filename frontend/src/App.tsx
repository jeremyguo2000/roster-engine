import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

export default function App() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="font-serif text-xl">Roster Engine</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-serif tracking-tight">
            Welcome to Roster Engine
          </h1>
          <p className="mt-4 text-muted-foreground">
            The full frontend is being built phase by phase. This is the Phase 1
            foundation — fonts, theme, dark mode, Docker integration, and the
            shadcn primitives are all wired up.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button>Primary action</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <p className="mt-8 font-mono text-xs text-muted-foreground">
            Backend health: <code>GET /api/health</code>
          </p>
        </div>
      </main>
    </div>
  );
}
