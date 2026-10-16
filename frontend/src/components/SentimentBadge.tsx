import { Badge } from "@/components/ui/badge";

export function SentimentBadge({ label }: { label?: string | null }) {
  const normalized = (label || "unknown").toLowerCase();
  const variant =
    normalized === "positive"
      ? "success"
      : normalized === "negative"
        ? "danger"
        : normalized === "neutral"
          ? "warning"
          : "outline";

  return (
    <Badge className="capitalize" variant={variant}>
      {normalized === "unknown" ? "No sentiment" : normalized}
    </Badge>
  );
}
