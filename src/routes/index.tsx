import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CheckCircle2,
  Clock,
  Inbox,
  RefreshCw,
  Share2,
  TrendingUp,
  Trophy,
  UserCheck,
  Zap,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { generateData, PERIOD_LABELS, type PeriodKey } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Suporte Técnico" },
      { name: "description", content: "Dashboard de monitoramento de chamados e produtividade da equipe de suporte técnico em tempo real." },
      { property: "og:title", content: "Dashboard — Suporte Técnico" },
      { property: "og:description", content: "Monitore métricas de atendimento, KPIs e produtividade dos atendentes em tempo real." },
    ],
  }),
  component: DashboardPage,
});

const PERIODS: PeriodKey[] = ["today", "yesterday", "7d", "30d"];

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DashboardPage() {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);

  const data = useMemo(() => generateData(period), [period, refreshTick]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, [period, refreshTick]);

  // Auto refresh every 60s
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header
        updatedAt={data.updatedAt}
        period={period}
        onPeriodChange={setPeriod}
        onRefresh={() => setRefreshTick((n) => n + 1)}
      />

      <main className="mx-auto max-w-[1500px] space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <KpiGrid data={data} loading={loading} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <HourlyChart data={data} loading={loading} />
          <AgentsChart data={data} loading={loading} />
        </div>

        <TrendChart data={data} loading={loading} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <RankingTable data={data} loading={loading} className="lg:col-span-2" />
          <InsightsPanel data={data} loading={loading} />
        </div>
      </main>
    </div>
  );
}

/* ---------- Header ---------- */

function Header({
  updatedAt,
  period,
  onPeriodChange,
  onRefresh,
}: {
  updatedAt: string;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  onRefresh: () => void;
}) {
  const [spin, setSpin] = useState(false);
  const handleRefresh = () => {
    setSpin(true);
    onRefresh();
    setTimeout(() => setSpin(false), 600);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:px-6 lg:flex lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="truncate text-xs text-muted-foreground">
              Última atualização: <span className="tabular-nums">{formatTime(updatedAt)}</span>
            </p>
          </div>
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-auto lg:ml-auto">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  period === p
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", spin && "animate-spin")} />
            Atualizar
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- KPI grid ---------- */

function KpiGrid({ data, loading }: { data: ReturnType<typeof generateData>; loading: boolean }) {
  const k = data.kpis;
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard label="Total de Chamados" value={fmt(k.total.value)} delta={k.total.delta} icon={Inbox} tone="primary" loading={loading} />
      <KpiCard label="Chamados Fechados" value={fmt(k.closed.value)} delta={k.closed.delta} icon={CheckCircle2} tone="success" loading={loading} />
      <KpiCard label="Chamados Transferidos" value={fmt(k.transferred.value)} delta={k.transferred.delta} icon={Share2} tone="warning" loading={loading} />
      <KpiCard label="Média de Atendimentos / Dia" value={fmt(k.dailyAvg.value)} delta={k.dailyAvg.delta} icon={TrendingUp} tone="info" loading={loading} />
      <KpiCard label="Fechados por Atendente" value={fmt(k.closedPerAgent.value)} delta={k.closedPerAgent.delta} icon={UserCheck} tone="primary" loading={loading} />
    </div>
  );
}

/* ---------- Charts ---------- */

const TOOLTIP_STYLE = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "var(--shadow-card)",
  color: "var(--color-foreground)",
} as const;

function SkeletonChart({ height = 260 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-muted" style={{ height }} />;
}

function HourlyChart({ data, loading }: { data: ReturnType<typeof generateData>; loading: boolean }) {
  return (
    <ChartCard
      title="Atendimentos ao Longo do Dia"
      subtitle="Volume de chamados por hora"
      className="xl:col-span-2"
    >
      {loading ? (
        <SkeletonChart />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.hourly} margin={{ top: 5, right: 16, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="oklch(0.55 0.2 260)" />
                <stop offset="100%" stopColor="oklch(0.55 0.18 290)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="hour" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--color-border)" }} />
            <Line
              type="monotone"
              dataKey="count"
              name="Atendimentos"
              stroke="url(#lineGrad)"
              strokeWidth={2.5}
              dot={{ r: 0 }}
              activeDot={{ r: 5, fill: "oklch(0.55 0.2 260)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function AgentsChart({ data, loading }: { data: ReturnType<typeof generateData>; loading: boolean }) {
  const avg = useMemo(
    () => Math.round(data.agents.reduce((s, a) => s + a.closed, 0) / Math.max(data.agents.length, 1)),
    [data.agents],
  );
  const top = data.agents[0];

  return (
    <ChartCard
      title="Produtividade dos Atendentes"
      subtitle={`Média da equipe: ${avg} chamados`}
      action={
        top && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--success)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--success)]">
            <Trophy className="h-3 w-3" /> {top.name.split(" ")[0]}
          </span>
        )
      }
    >
      {loading ? (
        <SkeletonChart />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.agents} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-accent)" }} />
            <Bar dataKey="closed" name="Fechados" fill="oklch(0.55 0.2 260)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function TrendChart({ data, loading }: { data: ReturnType<typeof generateData>; loading: boolean }) {
  return (
    <ChartCard title="Tendência de Chamados" subtitle="Abertos, fechados e pendentes ao longo dos dias">
      {loading ? (
        <SkeletonChart height={300} />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data.trend} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="gAb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.55 0.2 260)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.55 0.2 260)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gFe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.17 155)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.65 0.17 155)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gPe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.15 75)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.78 0.15 75)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--color-border)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Area type="monotone" dataKey="abertos" name="Abertos" stroke="oklch(0.55 0.2 260)" strokeWidth={2} fill="url(#gAb)" />
            <Area type="monotone" dataKey="fechados" name="Fechados" stroke="oklch(0.65 0.17 155)" strokeWidth={2} fill="url(#gFe)" />
            <Area type="monotone" dataKey="pendentes" name="Pendentes" stroke="oklch(0.78 0.15 75)" strokeWidth={2} fill="url(#gPe)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/* ---------- Ranking table ---------- */

type SortKey = "closed" | "avgTimeMin" | "resolutionRate" | "name";

function RankingTable({
  data,
  loading,
  className,
}: {
  data: ReturnType<typeof generateData>;
  loading: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "closed", dir: "desc" });

  const rows = useMemo(() => {
    const r = [...data.agents];
    r.sort((a, b) => {
      const av = a[sort.key] as number | string;
      const bv = b[sort.key] as number | string;
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [data.agents, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const Th = ({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) => (
    <th
      onClick={() => toggle(k)}
      className={cn(
        "cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sort.key === k && <span className="text-[10px]">{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );

  return (
    <ChartCard title="Ranking de Atendentes" subtitle="Clique nas colunas para ordenar" className={className}>
      {loading ? (
        <SkeletonChart height={320} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th k="name">Atendente</Th>
                <Th k="closed" align="right">Fechados</Th>
                <Th k="avgTimeMin" align="right">Tempo Médio</Th>
                <Th k="resolutionRate" align="right">Taxa Resolução</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.name} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">#{i + 1}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                    {a.closed.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">{a.avgTimeMin} min</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                        a.resolutionRate >= 90
                          ? "bg-[color:var(--success)]/10 text-[color:var(--success)]"
                          : a.resolutionRate >= 80
                            ? "bg-[color:var(--info)]/10 text-[color:var(--info)]"
                            : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
                      )}
                    >
                      {a.resolutionRate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

/* ---------- Insights ---------- */

function InsightsPanel({ data, loading }: { data: ReturnType<typeof generateData>; loading: boolean }) {
  const insights = useMemo(() => {
    if (!data) return [];
    const sortedHours = [...data.hourly].sort((a, b) => b.count - a.count);
    const peak = sortedHours[0];
    const low = sortedHours[sortedHours.length - 1];
    const topAgent = data.agents[0];
    const fastest = [...data.agents].sort((a, b) => a.avgTimeMin - b.avgTimeMin)[0];
    const teamRate =
      data.agents.reduce((s, a) => s + a.resolutionRate, 0) / Math.max(data.agents.length, 1);

    return [
      { icon: Zap, tone: "primary" as const, label: "Pico de atendimentos", value: `${peak.hour} · ${peak.count} chamados` },
      { icon: Clock, tone: "info" as const, label: "Menor movimento", value: `${low.hour} · ${low.count} chamados` },
      { icon: Trophy, tone: "success" as const, label: "Maior produtividade", value: `${topAgent.name} · ${topAgent.closed}` },
      { icon: Activity, tone: "warning" as const, label: "Menor tempo médio", value: `${fastest.name} · ${fastest.avgTimeMin} min` },
      { icon: CheckCircle2, tone: "success" as const, label: "Taxa de resolução geral", value: `${teamRate.toFixed(1)}%` },
    ];
  }, [data]);

  const TONE: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-[color:var(--success)]/10 text-[color:var(--success)]",
    warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
    info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
  };

  return (
    <ChartCard title="Resumo Executivo" subtitle="Insights automáticos do período">
      {loading ? (
        <SkeletonChart height={320} />
      ) : (
        <ul className="space-y-3">
          {insights.map((it) => (
            <li key={it.label} className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
              <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", TONE[it.tone])}>
                <it.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{it.label}</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{it.value}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
