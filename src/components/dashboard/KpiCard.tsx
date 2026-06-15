import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta: number;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "info";
  loading?: boolean;
}

const TONE_BG: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-[color:var(--success)]/10 text-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
};

export function KpiCard({ label, value, delta, icon: Icon, tone = "primary", loading }: KpiCardProps) {
  const positive = delta >= 0;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          )}
        </div>
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", TONE_BG[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {!loading && (
        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
              positive
                ? "bg-[color:var(--success)]/10 text-[color:var(--success)]"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs. período anterior</span>
        </div>
      )}
    </div>
  );
}
