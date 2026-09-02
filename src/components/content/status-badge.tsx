import {
  Ban,
  Check,
  CircleDashed,
  Clock3,
  FileEdit,
  Paintbrush,
  PauseCircle,
  Send,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { humanStatus, statusBadgeVariant } from "@/lib/content/status";

const ICONS = {
  draft: FileEdit,
  content_review: Clock3,
  approved_for_design: Check,
  in_design: Paintbrush,
  creative_review: Clock3,
  ready_to_publish: UploadCloud,
  partially_published: Send,
  published: Check,
  changes_requested: CircleDashed,
  blocked: PauseCircle,
  cancelled: Ban,
} as const;

export function StatusBadge({
  status,
  t,
}: {
  status: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const Icon = ICONS[status as keyof typeof ICONS] ?? CircleDashed;
  return (
    <Badge variant={statusBadgeVariant(status)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t ? t(`planningFilters.statusLabels.${status}`) : humanStatus(status)}
    </Badge>
  );
}
