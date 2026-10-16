import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  helper?: string;
  icon?: LucideIcon;
  tone?: "blue" | "teal" | "amber" | "rose";
}

const tones = {
  blue: "bg-blue-50 text-blue-700",
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
};

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "blue",
}: MetricCardProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-semibold tracking-normal">
              {value}
            </p>
          </div>
          {Icon ? (
            <span className={cn("rounded-lg p-2", tones[tone])}>
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
        </div>
        {helper ? <p className="mt-3 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
