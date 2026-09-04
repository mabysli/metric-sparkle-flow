/**
 * src/routes/index.tsx
 * ============================================================================
 * 📊 PÁGINA PRINCIPAL — DASHBOARD DE SUPORTE TÉCNICO
 * ============================================================================
 *
 * Esta é a tela única deste projeto. Ela é responsável por:
 *   1. Buscar os dados (via `fetchDashboard` em src/lib/dashboard-api.ts).
 *      → É lá que você troca o mock pela API real.
 *   2. Controlar o estado da interface (período selecionado, loading, erro).
 *   3. Atualizar automaticamente os dados a cada 60 segundos.
 *   4. Renderizar o cabeçalho, os KPIs, os gráficos e o ranking.
 *
 * Está organizada em pequenos sub-componentes (Header, KpiGrid, HourlyChart...)
 * todos definidos no MESMO arquivo para facilitar a leitura linear por quem
 * está começando. Em um projeto maior, cada um viraria seu próprio arquivo.
 * ============================================================================
 */

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
} from "recharts"; // biblioteca de gráficos baseada em React + SVG
import {
  Activity,
  AlertCircle,
  CalendarIcon,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  Timer,
  TrendingUp,
  Trophy,
  UserCheck,
  Zap,
} from "lucide-react"; // ícones SVG
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { type AgentProgressPoint, type DashboardData, type DateRange } from "@/lib/dashboard-data";
import { formatDuration } from "@/lib/format-duration"; // 🆕 formata segundos ("10m 1s")
import { fetchAgentProgress, fetchDashboard } from "@/lib/dashboard-api"; // 🔌 integração com a API
// 🆕 (ALTERAÇÃO DESTA REVISÃO) Catálogo de departamentos para montar o
//    seletor de filtro por departamento (ver `DEPARTMENT_OPTIONS` abaixo).
import { DEFAULT_DEPARTMENT_IDS, DEPARTMENTS } from "@/lib/digisac-catalog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange as RdpRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

// Registro da rota "/" no TanStack Router + metatags SEO.
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

// Intervalo (em milissegundos) do auto-refresh — requisito do dashboard.
const AUTO_REFRESH_MS = 60_000;

/** Converte um `Date` para string ISO no formato YYYY-MM-DD (sem fuso). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Cria o intervalo padrão inicial: últimos 7 dias (inclui hoje). */
function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  // 🆕 (ALTERAÇÃO) O intervalo agora carrega também as HORAS de início/fim.
  return { from: toISODate(from), to: toISODate(to), fromTime: "00:00", toTime: "23:59" };
}

/**
 * 🆕 (ALTERAÇÃO DESTA REVISÃO) Opções do filtro de DEPARTAMENTO.
 * "" (vazio) = "Ambos" → a API é chamada uma vez por departamento de
 * `DEFAULT_DEPARTMENT_IDS` e os resultados são SOMADOS (ver
 * `fetchTotals`/`mergeTotals` em src/lib/dashboard-api.ts).
 * Qualquer outro valor = um departamento específico → só ele é consultado.
 */
const DEPARTMENT_OPTIONS = [
  { value: "", label: "Ambos os departamentos" },
  // Só entram no seletor os departamentos consultados por padrão
  // (o "Robô" fica de fora, pois não faz parte das métricas).
  ...DEFAULT_DEPARTMENT_IDS.map((id) => ({
    value: id,
    label: DEPARTMENTS.find((d) => d.id === id)?.name ?? id,
  })),
];

/** Formata uma data ISO em pt-BR para exibir no cabeçalho. */
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

/**
 * Componente raiz da página. Concentra os 3 estados principais:
 *   - `period`: qual filtro de período está selecionado
 *   - `data`:   os dados vindos da API (ou null antes do 1º carregamento)
 *   - `error`:  mensagem de erro caso a chamada à API falhe
 */
function DashboardPage() {
  // 🆕 Substituímos o filtro de "período pré-definido" por um INTERVALO
  //    de datas escolhido em um calendário no cabeçalho.
  const [range, setRange] = useState<DateRange>(defaultRange);
  // 🆕 (ALTERAÇÃO DESTA REVISÃO) Filtro de DEPARTAMENTO.
  //    "" = ambos (a API é consultada por departamento e os totais somados);
  //    um ID = somente aquele departamento.
  const [departmentId, setDepartmentId] = useState<string>("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Função que efetivamente busca os dados. Centralizamos numa variável
   * para reutilizar no carregamento inicial, ao trocar de período e no
   * auto-refresh de 60 segundos.
   *
   * 🆕 Agora repassa também o departamento escolhido: quando `departmentId`
   * está vazio, enviamos `undefined` para que o dashboard-api some TODOS
   * os departamentos padrão (ver `DEFAULT_DEPARTMENT_IDS`).
   */
  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchDashboard(range, { departmentId: departmentId || undefined });
      if (signal?.aborted) return; // evita atualizar estado de uma chamada cancelada
      setData(fresh);
    } catch (err) {
      console.error("Falha ao carregar dashboard:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  // Carrega/recarrega sempre que o usuário troca o filtro de período
  // 🆕 ...ou o filtro de departamento.
  // O `AbortController` cancela requisições anteriores se o usuário
  // clicar rápido em vários períodos seguidos.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, range.fromTime, range.toTime, departmentId]);

  // Atualização automática a cada 60 segundos (requisito do projeto).
  useEffect(() => {
    const id = setInterval(() => load(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, range.fromTime, range.toTime, departmentId]);

  return (
    <div className="min-h-screen bg-background">
      <Header
        updatedAt={data?.updatedAt ?? null}
        range={range}
        onRangeChange={setRange}
        departmentId={departmentId}
        onDepartmentChange={setDepartmentId}
        onRefresh={() => load()}
      />

      <main className="mx-auto max-w-[1500px] space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        {/* Estado de erro: mostra um alerta com botão para tentar de novo */}
        {error && !loading && (
          <ErrorBanner message={error} onRetry={() => load()} />
        )}

        {/* Mostramos a UI mesmo durante o loading inicial:
            os próprios cards exibem seus skeletons quando `loading` é true. */}
        <KpiGrid data={data} loading={loading} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <HourlyChart data={data} loading={loading} />
          <AgentsChart data={data} loading={loading} />
        </div>

        <TrendChart data={data} loading={loading} />

        {/* 🆕 (ALTERAÇÃO DESTA REVISÃO) Dois dashboards de progresso individual:
            o 2º (chamados fechados) e o 3º (métricas de tempo), cada um com
            um painel lateral de comparação com a equipe.
            🆕 Também recebem o departamento filtrado no cabeçalho. */}
        <AgentProgressSection data={data} range={range} departmentId={departmentId} />


        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <RankingTable data={data} loading={loading} className="lg:col-span-2" />
          <InsightsPanel data={data} loading={loading} />
        </div>
      </main>
    </div>
  );
}

/* ============================================================================
 * Cabeçalho fixo no topo da página: logo + título, hora da última
 * atualização, filtro de período e botão "Atualizar".
 * ========================================================================== */

function Header({
  updatedAt,
  range,
  onRangeChange,
  departmentId,
  onDepartmentChange,
  onRefresh,
}: {
  updatedAt: string | null;
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
  // 🆕 (ALTERAÇÃO DESTA REVISÃO) Filtro de departamento:
  // "" = ambos; um ID = apenas aquele departamento.
  departmentId: string;
  onDepartmentChange: (id: string) => void;
  onRefresh: () => void;
}) {
  // Estado local apenas para animar o ícone girando ao clicar em "Atualizar".
  const [spin, setSpin] = useState(false);
  // Evita diferença entre servidor e navegador ao formatar a data/hora:
  // só mostramos o horário depois que o componente monta no browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const handleRefresh = () => {
    setSpin(true);
    onRefresh();
    setTimeout(() => setSpin(false), 600);
  };

  // 🆕 Estado do popover do calendário e do intervalo selecionado.
  //    Usamos o tipo `RdpRange` (react-day-picker) enquanto o usuário
  //    ainda está escolhendo — só notificamos o pai (`onRangeChange`)
  //    quando `from` E `to` estão preenchidos.
  const rdpValue: RdpRange = {
    from: new Date(range.from + "T00:00:00"),
    to: new Date(range.to + "T00:00:00"),
  };

  const handleSelectRange = (r: RdpRange | undefined) => {
    if (r?.from && r?.to) {
      // 🆕 Preserva as horas escolhidas ao trocar as datas.
      onRangeChange({
        from: toISODate(r.from),
        to: toISODate(r.to),
        fromTime: range.fromTime ?? "00:00",
        toTime: range.toTime ?? "23:59",
      });
    }
  };

  const rangeLabel =
    range.from === range.to
      ? format(new Date(range.from + "T00:00:00"), "dd 'de' MMM, yyyy", { locale: ptBR })
      : `${format(new Date(range.from + "T00:00:00"), "dd MMM", { locale: ptBR })} — ${format(
          new Date(range.to + "T00:00:00"),
          "dd MMM, yyyy",
          { locale: ptBR },
        )}`;
  // 🆕 Mostra as horas selecionadas junto do intervalo no botão do filtro.
  const fullLabel = `${rangeLabel} · ${range.fromTime ?? "00:00"}–${range.toTime ?? "23:59"}`;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:px-6 lg:flex lg:px-8">
        {/* Bloco da esquerda: logo + título + última atualização */}
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
              Última atualização:{" "}
              <span className="tabular-nums">{mounted && updatedAt ? formatTime(updatedAt) : "—"}</span>
            </p>
          </div>
        </div>

        {/* Bloco da direita: 🆕 seletor de intervalo (calendário) + botão de atualizar */}
        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-auto lg:ml-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 rounded-lg border-border bg-card text-xs font-medium text-foreground shadow-sm hover:bg-accent"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {fullLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              {/* Calendário em modo "range": usuário clica no início e depois no fim. */}
              <Calendar
                mode="range"
                selected={rdpValue}
                onSelect={handleSelectRange}
                numberOfMonths={2}
                defaultMonth={rdpValue.from}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
              {/* 🆕 (ALTERAÇÃO) Seleção de HORA de início e de fim, logo abaixo
                  do calendário — pedido: "na filtragem por data apareça um
                  lugar para selecionar por hora". */}
              <div className="flex items-end gap-3 border-t border-border p-3">
                <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Hora inicial
                  <input
                    type="time"
                    value={range.fromTime ?? "00:00"}
                    onChange={(e) => onRangeChange({ ...range, fromTime: e.target.value })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Hora final
                  <input
                    type="time"
                    value={range.toTime ?? "23:59"}
                    onChange={(e) => onRangeChange({ ...range, toTime: e.target.value })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                  />
                </label>
              </div>
            </PopoverContent>
          </Popover>
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

/* ============================================================================
 * Banner de erro exibido quando a chamada à API falha.
 * ========================================================================== */

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-destructive">Não foi possível carregar os dados</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        Tentar novamente
      </button>
    </div>
  );
}

/* ============================================================================
 * Grade de KPIs (os 5 cards de números do topo). Cada card é um <KpiCard />.
 * ========================================================================== */

function KpiGrid({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  // Valores padrão para enquanto os dados não chegaram (1º render).
  const empty = { value: 0, delta: 0 };
  const k = data?.kpis ?? {
    total: empty,
    open: empty,
    closed: empty,
    dailyAvg: empty,
    closedPerAgent: empty,
    tma: empty,
    pte: empty,
    tme: empty,
    botWait: empty,
    resolutionRate: empty,
    contacts: empty,
    messages: empty,
  };
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  return (
    // ❌ KPI "Chamados Transferidos" removido conforme solicitado.
    // 🆕 (ALTERAÇÃO) Grade ampliada com TODAS as variáveis da imagem enviada.
    //    Os KPIs de tempo chegam em SEGUNDOS e são formatados por
    //    `formatDuration` (ex.: "7h 6m", "10m 1s", "45s").
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* ❌ (ALTERAÇÃO DESTA REVISÃO) KPI "Total de Chamados / Atendido" removido:
          na prática ele sempre repetia o valor de "Chamados Fechados". */}
      <KpiCard label="Chamados Abertos" value={fmt(k.open.value)} delta={k.open.delta} icon={Activity} tone="warning" loading={loading} />
      <KpiCard label="Chamados Fechados" value={fmt(k.closed.value)} delta={k.closed.delta} icon={CheckCircle2} tone="success" loading={loading} />
      <KpiCard label="Média de Atendimentos / Dia" value={fmt(k.dailyAvg.value)} delta={k.dailyAvg.delta} icon={TrendingUp} tone="info" loading={loading} />
      <KpiCard label="Fechados por Atendente" value={fmt(k.closedPerAgent.value)} delta={k.closedPerAgent.delta} icon={UserCheck} tone="primary" loading={loading} />
      {/* 🆕 Tempos (em segundos, formatados) */}
      <KpiCard label="TMA — Tempo Médio de Atendimento" value={formatDuration(k.tma.value)} delta={k.tma.delta} icon={Clock} tone="info" loading={loading} />
      <KpiCard label="PTE — Primeiro Tempo de Espera" value={formatDuration(k.pte.value)} delta={k.pte.delta} icon={Timer} tone="warning" loading={loading} />
      {/* ❌ (ALTERAÇÃO DESTA REVISÃO) KPI "TME — Tempo Médio de Espera" removido:
          estava sujando a leitura dos dados (sobrepunha PTE e Espera após o Bot). */}
      <KpiCard label="Espera após o Bot" value={formatDuration(k.botWait.value)} delta={k.botWait.delta} icon={Zap} tone="info" loading={loading} />
      {/* 🆕 Qualidade e volume */}
      <KpiCard label="Taxa de Resolução" value={`${k.resolutionRate.value.toFixed(1)}%`} delta={k.resolutionRate.delta} icon={Trophy} tone="success" loading={loading} />
      <KpiCard label="Contatos" value={fmt(k.contacts.value)} delta={k.contacts.delta} icon={UserCheck} tone="info" loading={loading} />
      <KpiCard label="Mensagens" value={fmt(k.messages.value)} delta={k.messages.delta} icon={MessageSquare} tone="primary" loading={loading} />
    </div>
  );
}

/* ============================================================================
 * Estilos compartilhados e helpers dos gráficos.
 * ========================================================================== */

// Estilo aplicado ao "tooltip" (caixinha que aparece quando o mouse passa
// sobre o gráfico). Usar variáveis CSS mantém a aparência integrada ao tema.
const TOOLTIP_STYLE = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "var(--shadow-card)",
  color: "var(--color-foreground)",
} as const;

/** Placeholder animado exibido enquanto os dados estão sendo carregados. */
function SkeletonChart({ height = 260 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-muted" style={{ height }} />;
}

/* ----------------------------- Gráfico de Linha --------------------------- */
// Volume de atendimentos por hora do dia (00h–23h).
function HourlyChart({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  return (
    <ChartCard
      title="Atendimentos ao Longo do Dia"
      subtitle="Volume de chamados por hora"
      className="xl:col-span-2"
    >
      {loading || !data ? (
        <SkeletonChart />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.hourly} margin={{ top: 5, right: 16, left: -8, bottom: 0 }}>
            <defs>
              {/* Gradiente aplicado à linha do gráfico */}
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

/* ----------------------- Gráfico de Barras (horizontal) ------------------- */
// Produtividade dos atendentes — quantos chamados cada um fechou.
function AgentsChart({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  // `useMemo` evita recalcular a média toda vez que o componente renderiza.
  const avg = useMemo(
    () =>
      data
        ? Math.round(data.agents.reduce((s, a) => s + a.closed, 0) / Math.max(data.agents.length, 1))
        : 0,
    [data],
  );
  const top = data?.agents[0];

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
      {loading || !data ? (
        <SkeletonChart />
      ) : (
        // 🆕 Altura calculada em função da quantidade de atendentes
        //    para exibir TODOS sem sobreposição/cortes de rótulos.
        <ResponsiveContainer width="100%" height={Math.max(280, data.agents.length * 32)}>
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

/* --------------------------- Gráfico de Área ------------------------------ */
// Tendência: compara chamados abertos vs. fechados vs. pendentes por dia.
function TrendChart({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  return (
    <ChartCard title="Tendência de Chamados" subtitle="Abertos, fechados e pendentes ao longo dos dias">
      {loading || !data ? (
        <SkeletonChart height={300} />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data.trend} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
            <defs>
              {/* Um gradiente vertical por série, para dar profundidade às áreas */}
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

/* ============================================================================
 * Tabela de Ranking de Atendentes — clique nos cabeçalhos para ordenar.
 * ========================================================================== */

// Chaves possíveis de ordenação (nome de coluna).
// 🆕 Substituímos `resolutionRate` pelas novas métricas de tempo.
// 🆕 (ALTERAÇÃO) Ordenamos pelas versões em SEGUNDOS das métricas de tempo.
// 🆕 (ALTERAÇÃO DESTA REVISÃO) Novas colunas ordenáveis: total, abertos,
// PTE, taxa de resolução, contatos e mensagens (os mesmos indicadores da
// grade de KPIs, agora por atendente).
type SortKey =
  | "closed"
  | "avgTimeSec"
  | "firstContactSec"
  | "avgCloseSec"
  | "open"
  | "pteSec"
  | "resolutionRate"
  | "contacts"
  | "messages"
  | "name";

function RankingTable({
  data,
  loading,
  className,
}: {
  data: DashboardData | null;
  loading: boolean;
  className?: string;
}) {
  // Estado de ordenação atual: qual coluna e em qual direção (asc/desc).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "closed", dir: "desc" });
  // 🆕 (ALTERAÇÃO DESTA REVISÃO) Atendente em DESTAQUE: o nome dele fica
  // colorido (e a linha realçada) para facilitar achá-lo no ranking.
  const [highlight, setHighlight] = useState<string>("");


  // Ordena uma cópia dos atendentes conforme o estado de ordenação.
  // Sempre fazemos uma cópia (`[...]`) para não mutar o array original.
  const rows = useMemo(() => {
    const r = data ? [...data.agents] : [];
    r.sort((a, b) => {
      const av = (a[sort.key] ?? 0) as number | string;
      const bv = (b[sort.key] ?? 0) as number | string;
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [data, sort]);

  // Alterna a coluna: se clicou na mesma, inverte direção; senão, começa em desc.
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  // Componente local <Th> apenas para encurtar a marcação dos cabeçalhos.
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
    <ChartCard
      title="Ranking de Atendentes"
      subtitle="Clique nas colunas para ordenar"
      className={className}
      // 🆕 (ALTERAÇÃO DESTA REVISÃO) Seletor de atendente em DESTAQUE.
      action={
        <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Destacar
          <select
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-medium normal-case tracking-normal text-foreground shadow-sm"
          >
            <option value="">Nenhum</option>
            {(data?.agents ?? []).map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {loading || !data ? (
        <SkeletonChart height={320} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th k="name">Atendente</Th>
                {/* ❌ Coluna "Total" removida — sempre igual a "Fechados". */}
                <Th k="open" align="right">Abertos</Th>
                <Th k="closed" align="right">Fechados</Th>
                <Th k="avgTimeSec" align="right">TMA</Th>
                <Th k="pteSec" align="right">PTE</Th>
                {/* ❌ Coluna "TME" removida — poluía a leitura dos tempos. */}
                <Th k="firstContactSec" align="right">Após Bot</Th>
                <Th k="avgCloseSec" align="right">T. Fechamento</Th>
                {/* 🆕 Qualidade e volume de conversas */}
                <Th k="resolutionRate" align="right">Resolução</Th>
                <Th k="contacts" align="right">Contatos</Th>
                <Th k="messages" align="right">Mensagens</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const isHighlighted = highlight === a.name;
                return (
                <tr
                  key={a.name}
                  className={cn(
                    "border-b border-border/60 last:border-0 hover:bg-accent/40",
                    isHighlighted && "bg-primary/5",
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* "Avatar" feito com as iniciais do nome */}
                      <div
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                          isHighlighted ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        {a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0">
                        {/* 🆕 Nome colorido quando o atendente está em destaque */}
                        <p
                          className={cn(
                            "truncate text-sm font-medium text-foreground",
                            isHighlighted && "font-bold text-primary",
                          )}
                        >
                          {a.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">#{i + 1}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {(a.open ?? 0).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                    {a.closed.toLocaleString("pt-BR")}
                  </td>
                  {/* 🆕 Todas as células de tempo agora exibem SEGUNDOS ("10m 1s") */}
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {formatDuration(a.avgTimeSec)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {formatDuration(a.pteSec)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {formatDuration(a.firstContactSec)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {formatDuration(a.avgCloseSec)}
                  </td>
                  {/* 🆕 Qualidade e volume de conversas */}
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {a.resolutionRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {(a.contacts ?? 0).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {(a.messages ?? 0).toLocaleString("pt-BR")}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

/* ============================================================================
 * Painel de Resumo Executivo — destaques calculados a partir dos dados.
 * (Pico/vale de atendimentos, maior produtividade, menor tempo, taxa geral.)
 * ========================================================================== */

function InsightsPanel({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const insights = useMemo(() => {
    if (!data) return [];

    // Ordena horários por volume para descobrir pico e vale.
    const sortedHours = [...data.hourly].sort((a, b) => b.count - a.count);
    const peak = sortedHours[0];
    const low = sortedHours[sortedHours.length - 1];

    // `data.agents` já vem ordenado por "closed" → primeiro = mais produtivo.
    const topAgent = data.agents[0];

    // Atendente com menor tempo médio = mais rápido.
    const fastest = [...data.agents].sort((a, b) => (a.avgTimeSec ?? 0) - (b.avgTimeSec ?? 0))[0];

    // 🆕 Médias da equipe em SEGUNDOS.
    // ❌ (ALTERAÇÃO DESTA REVISÃO) O insight de TME (tempo médio de resposta)
    //    foi removido junto com o KPI/coluna correspondentes.
    const avgFirstContact =
      data.agents.reduce((s, a) => s + (a.firstContactSec ?? 0), 0) / Math.max(data.agents.length, 1);
    const avgClose =
      data.agents.reduce((s, a) => s + (a.avgCloseSec ?? 0), 0) / Math.max(data.agents.length, 1);

    return [
      { icon: Zap, tone: "primary" as const, label: "Pico de atendimentos", value: `${peak.hour} · ${peak.count} chamados` },
      { icon: Clock, tone: "info" as const, label: "Menor movimento", value: `${low.hour} · ${low.count} chamados` },
      { icon: Trophy, tone: "success" as const, label: "Maior produtividade", value: `${topAgent.name} · ${topAgent.closed}` },
      { icon: Activity, tone: "warning" as const, label: "Menor tempo médio", value: `${fastest.name} · ${formatDuration(fastest.avgTimeSec)}` },
      { icon: Timer, tone: "primary" as const, label: "T. 1º contato (pós-bot)", value: formatDuration(avgFirstContact) },
      { icon: CheckCircle2, tone: "success" as const, label: "T. médio de fechamento", value: formatDuration(avgClose) },
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
      {loading || !data ? (
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

/* ============================================================================
 * 🆕 SEÇÃO "PROGRESSO DO ATENDENTE" (2º e 3º dashboards)
 * ============================================================================
 * Pedido desta revisão:
 *   1. Criar um dashboard no MESMO estilo do 2º, porém com OUTRAS métricas
 *      (TME, 1º tempo de resposta e tempo médio de fechamento), com uma
 *      "label" para escolher o ATENDENTE e outra para escolher a MÉTRICA.
 *   2. Colocar AO LADO do 2º e do 3º dashboards um resumo com:
 *        • dias acima da média   • dias abaixo da média
 *        • dias com o MAIOR fechamento   • dias com o MENOR fechamento
 *
 * Como funciona: este componente busca UMA vez a série do atendente
 * (`fetchAgentProgress`, em src/lib/dashboard-api.ts — 🔌 integração real,
 * uma chamada por dia/atendente) e reaproveita os mesmos pontos nos dois
 * gráficos e no painel lateral.
 * ========================================================================== */

/** Métricas disponíveis no seletor do 3º dashboard (todas em segundos). */
const AGENT_METRICS = {
  tme: { label: "TME — Tempo Médio de Espera", value: "tmeValue", avg: "tmeAvg", min: "tmeMin", max: "tmeMax" },
  response: { label: "1º Tempo de Resposta (após o bot)", value: "responseValue", avg: "responseAvg", min: "responseMin", max: "responseMax" },
  close: { label: "Tempo Médio de Fechamento", value: "closeValue", avg: "closeAvg", min: "closeMin", max: "closeMax" },
} as const;

type MetricKey = keyof typeof AGENT_METRICS;

/** <select> padronizado usado nas "labels" de atendente e de métrica. */
function PickerLabel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-medium normal-case tracking-normal text-foreground shadow-sm"
      >
        {options.length === 0 && <option value="">Carregando…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Painel lateral com as somas de dias acima/abaixo da média e de recordes. */
function AgentStatsPanel({ points }: { points: AgentProgressPoint[] }) {
  const stats = useMemo(() => {
    let above = 0;
    let below = 0;
    let best = 0;
    let worst = 0;
    for (const p of points) {
      if (p.closed > p.teamAvgClosed) above += 1;
      if (p.closed < p.teamAvgClosed) below += 1;
      if (p.closed > 0 && p.closed === p.maxClosed) best += 1;
      if (p.closed > 0 && p.closed === p.minClosed) worst += 1;
    }
    return [
      { label: "Dias acima da média", value: above, tone: "success" as const, icon: TrendingUp },
      { label: "Dias abaixo da média", value: below, tone: "warning" as const, icon: Activity },
      { label: "Dias com maior fechamento", value: best, tone: "primary" as const, icon: Trophy },
      { label: "Dias com menor fechamento", value: worst, tone: "info" as const, icon: Clock },
    ];
  }, [points]);

  const TONE: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-[color:var(--success)]/10 text-[color:var(--success)]",
    warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
    info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
  };

  return (
    <ChartCard title="Comparação com a Equipe" subtitle="Somatório de dias no período filtrado">
      <ul className="space-y-3">
        {stats.map((s) => (
          <li key={s.label} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
            <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", TONE[s.tone])}>
              <s.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">{s.value}</p>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function AgentProgressSection({ data, range }: { data: DashboardData | null; range: DateRange }) {
  const names = useMemo(() => (data?.agents ?? []).map((a) => a.name), [data]);
  const [selected, setSelected] = useState<string>("");
  const [metric, setMetric] = useState<MetricKey>("tme");
  const [points, setPoints] = useState<AgentProgressPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seleciona automaticamente o primeiro atendente assim que a lista chega.
  useEffect(() => {
    if (!selected && names.length) setSelected(names[0]);
  }, [names, selected]);

  // Busca a série do atendente escolhido sempre que o nome ou o filtro mudam.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAgentProgress(range, selected)
      .then((p) => !cancelled && setPoints(p))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Erro desconhecido"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, range.from, range.to, range.fromTime, range.toTime]);

  const agentOptions = names.map((n) => ({ value: n, label: n }));
  const metricOptions = (Object.keys(AGENT_METRICS) as MetricKey[]).map((k) => ({
    value: k,
    label: AGENT_METRICS[k].label,
  }));
  const m = AGENT_METRICS[metric];
  const empty = loading || !points.length;

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* 2º dashboard — quantidade de chamados fechados + painel lateral */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title="Progresso do Atendente"
          subtitle="Compare o atendente com a média, o mínimo e o máximo fechado pela equipe em cada dia"
          action={
            <PickerLabel label="Atendente" value={selected} onChange={setSelected} options={agentOptions} />
          }
        >
          {empty ? (
            <SkeletonChart height={300} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--color-border)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Line type="monotone" dataKey="closed" name="Fechados (atendente)" stroke="oklch(0.65 0.17 155)" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="teamAvgClosed" name="Média fechados / dia" stroke="oklch(0.55 0.2 260)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="minClosed" name="Menor por atendente" stroke="oklch(0.7 0.18 25)" strokeWidth={1.8} strokeDasharray="2 3" dot={false} />
                <Line type="monotone" dataKey="maxClosed" name="Maior por atendente" stroke="oklch(0.78 0.15 75)" strokeWidth={1.8} strokeDasharray="2 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <AgentStatsPanel points={points} />
      </div>

      {/* 🆕 3º dashboard — mesma estrutura, porém com métricas de TEMPO
          selecionáveis (TME, 1º tempo de resposta, tempo de fechamento). */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title="Comparativo de Tempos do Atendente"
          subtitle="Escolha o atendente e a métrica para comparar com a média, o mínimo e o máximo da equipe"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <PickerLabel label="Atendente" value={selected} onChange={setSelected} options={agentOptions} />
              <PickerLabel
                label="Métrica"
                value={metric}
                onChange={(v) => setMetric(v as MetricKey)}
                options={metricOptions}
              />
            </div>
          }
        >
          {empty ? (
            <SkeletonChart height={300} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  tickFormatter={(v: number) => formatDuration(v)}
                />
                {/* Tooltip formatando os segundos como "10m 1s" */}
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ stroke: "var(--color-border)" }}
                  formatter={(v: number | string) => formatDuration(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Line type="monotone" dataKey={m.value} name={`${m.label} (atendente)`} stroke="oklch(0.65 0.17 155)" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={m.avg} name="Média da equipe" stroke="oklch(0.55 0.2 260)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey={m.min} name="Menor da equipe" stroke="oklch(0.7 0.18 25)" strokeWidth={1.8} strokeDasharray="2 3" dot={false} />
                <Line type="monotone" dataKey={m.max} name="Maior da equipe" stroke="oklch(0.78 0.15 75)" strokeWidth={1.8} strokeDasharray="2 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <AgentStatsPanel points={points} />
      </div>
    </div>
  );
}

