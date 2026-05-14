import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { GenerateWizard } from "./GenerateWizard";

export function GenerateRosterPage() {
  return (
    <div>
      <PageHeader
        title="Generate roster"
        description="Pick a profile, set the window, choose demands, and dispatch the solver."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/rosters">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to rosters
            </Link>
          </Button>
        }
      />
      <GenerateWizard />
    </div>
  );
}
