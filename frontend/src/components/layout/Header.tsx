import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  title?: string;
}

function openCommandPalette() {
  // CommandPalette listens for Cmd/Ctrl+K. Synthesise that key event so this
  // button works without coupling Header to the palette's internal state.
  const isMac = navigator.platform.toLowerCase().includes("mac");
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    }),
  );
}

export function Header({ title }: HeaderProps) {
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        {title && <h1 className="font-serif text-2xl">{title}</h1>}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={openCommandPalette}
          className="hidden gap-2 text-muted-foreground sm:inline-flex"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          Search
          <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </Button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
