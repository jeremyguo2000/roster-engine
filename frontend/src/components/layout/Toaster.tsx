import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "next-themes";

/** App-wide toast surface. Mounted once at the root. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      richColors
      closeButton
      position="bottom-right"
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        },
      }}
    />
  );
}
