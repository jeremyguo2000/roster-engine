import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ComingSoonProps {
  description?: string;
}

/** Renders a "Coming in a later phase" placeholder for routes still being built. */
export function ComingSoon({ description }: ComingSoonProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Construction className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Coming soon</p>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
