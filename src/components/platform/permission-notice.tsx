import { LockKeyhole } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function PermissionNotice({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <Card
      padding="lg"
      variant="subtle"
      className="border-warning/40 bg-warning-subtle"
      role="status"
    >
      <div className="flex items-start gap-3">
        <span
          className="text-warning mt-0.5"
          aria-hidden="true"
          data-testid="platform-permission-notice-icon"
        >
          <LockKeyhole className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </Card>
  );
}
