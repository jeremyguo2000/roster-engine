import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getApiErrorMessage } from "@/api/client";

interface Props {
  error: unknown;
  title?: string;
  className?: string;
}

/** Standard inline error banner for failed mutations / queries. */
export function MutationError({ error, title = "Action failed", className }: Props) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
    </Alert>
  );
}
