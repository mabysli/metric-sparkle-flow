/**
 * dashboard-data.ts
 * ============================================================================
 * Camada de DADOS SIMULADOS (mock) do dashboard.
 *
 * Aqui ficam:
 *   1. As INTERFACES TypeScript que descrevem o formato esperado dos dados
 *      vindos do backend (KPIs, ranking de atendentes, séries temporais).
 *      → Quando a API real existir, ela DEVE devolver o mesmo formato.
 *
 *   2. A função `generateData(period)` que cria números aleatórios mas
 *      previsíveis (usando uma semente) para que a interface tenha o que
 *      mostrar enquanto a integração real não está pronta.
 *
 * IMPORTANTE: a UI NUNCA importa este arquivo diretamente — ela conversa
 * apenas com `src/lib/dashboard-api.ts`, que decide entre mock ou API real.
 *
 * ----------------------------------------------------------------------
 * 🔧 AÇÕES REALIZADAS NESTA REVISÃO (resolução de merge + integração API)
 * ----------------------------------------------------------------------
 *   1) Havia dois conflitos de merge não resolvidos (`<<<<<<< HEAD` /
 *      `=======` / `>>>>>>>`) neste arquivo: no `export type PeriodKey`
 *      e na lista `AGENT_NAMES`. Ambos foram resolvidos abaixo.
 *   2) `PeriodKey` foi mantido apenas como tipo de compatibilidade (o
 *      filtro visual do cabeçalho agora usa `DateRange`, de/até).
 *   3) `AGENT_NAMES` ficou com a lista de nomes fictícios (branch mais
 *      recente) — os nomes REAIS dos atendentes (com `userId`) agora
 *      vivem em `digisac-catalog.ts`, usados só pela integração real em
 *      `dashboard-api.ts`. Isso evita misturar dados de mock com dados
 *      reais de pessoas.
 * ============================================================================
 */

// Períodos disponíveis no filtro do cabeçalho do dashboard.
// Mantido apenas como tipo de compatibilidade (usado pelo modo mock).
export type PeriodKey = "today" | "yesterday" | "7d" | "30d"; //!! mais datas futuramente

/** Intervalo de datas (from/até) usado pelo calendário do cabeçalho e por `fetchDashboard`. */
export interface DateRange {
  from: string; // "YYYY-MM-DD"
  to: string;   // "YYYY-MM-DD"
  // 🆕 (ALTERAÇÃO) Agora o filtro também aceita HORA de início e de fim.
  // Formato "HH:MM". Quando ausentes, assumimos 00:00 e 23:59.
  fromTime?: string;
  toTime?: string;
}

/** Métricas individuais de um atendente (linha do ranking). */
export interface Agent {
  name: string;              // nome do atendente
  closed: number;            // total de chamados fechados no período
  avgTimeMin: number;        // tempo médio de atendimento em minutos (campo legado)
  resolutionRate: number;    // taxa de resolução em % (0–100)
  avgResponseMin?: number;   // tempo médio de resposta (waitingTimeAvg)
  firstContactMin?: number;  // tempo médio até o primeiro contato (waitingTimeAfterBot)
  avgCloseMin?: number;      // tempo médio até o fechamento (ticketTime)
  // 🆕 (ALTERAÇÃO) Versões em SEGUNDOS — são estas que a tela exibe agora,
  // formatadas por `formatDuration` (ex.: "10m 1s"). Os campos em minutos
  // acima ficam só por compatibilidade.
  avgTimeSec?: number;
  avgResponseSec?: number;
  firstContactSec?: number;
  avgCloseSec?: number;
  // 🆕 (ALTERAÇÃO DESTA REVISÃO) Indicadores da grade de KPIs replicados
  // POR ATENDENTE, para aparecerem também no ranking:
  total?: number;      // Total Atendido (totalTicketsCount)
  open?: number;       // Chamados Abertos (openedTicketsCount)
  pteSec?: number;     // PTE — Primeiro Tempo de Espera (waitingTime / total)
  contacts?: number;   // Contatos (contactsCount)
  messages?: number;   // Mensagens (totalMessagesCount)
}

/**
 * 🆕 (ALTERAÇÃO DESTA REVISÃO) Um ponto da EVOLUÇÃO DIÁRIA de UM atendente.
 * Alimenta o gráfico "Progresso do Atendente", onde o usuário escolhe o nome
 * e acompanha os números dele dia a dia dentro do intervalo filtrado.
 */
export interface AgentProgressPoint {
  date: string;        // rótulo do dia ("05/08")
  total: number;       // chamados atendidos no dia
  closed: number;      // chamados fechados no dia
  avgCloseSec: number; // tempo médio de fechamento no dia (segundos)
}

/** Um ponto da curva "atendimentos por hora do dia". */
export interface HourlyPoint {
  hour: string;  // rótulo no formato "00h" .. "23h"
  count: number; // quantidade de chamados naquela hora
}

/** Um ponto da curva de tendência diária. */
export interface TrendPoint {
  day: string;        // rótulo do dia (ex.: "D-6", "D-5"...)
  abertos: number;    // chamados abertos no dia
  fechados: number;   // chamados fechados no dia
  pendentes: number;  // chamados ainda pendentes
}

/** Um KPI: valor atual + variação (%) em relação ao período anterior. */
export interface KpiValue {
  value: number;
  delta: number;
}

/** Estrutura completa retornada pela API/mock para a tela do dashboard. */
export interface DashboardData {
  updatedAt: string; // ISO timestamp — usado no cabeçalho "Última atualização"
  // 🆕 (ALTERAÇÃO) Conjunto de KPIs ampliado para cobrir TODAS as variáveis
  // da imagem enviada. Os KPIs de tempo estão em SEGUNDOS.
  kpis: {
    total: KpiValue;          // Total Atendido (totalTicketsCount)
    open: KpiValue;           // 🆕 Chamados Abertos (openedTicketsCount)
    closed: KpiValue;         // Chamados Fechados (closedTicketsCount)
    dailyAvg: KpiValue;       // Média de atendimentos por dia
    closedPerAgent: KpiValue; // Fechados por atendente
    tma: KpiValue;            // 🆕 Tempo Médio de Atendimento (ticketTime médio), em s
    pte: KpiValue;            // 🆕 Primeiro Tempo de Espera (waitingTime médio), em s
    tme: KpiValue;            // 🆕 Tempo Médio de Espera (waitingTimeAvg), em s
    botWait: KpiValue;        // 🆕 Espera após o Bot (waitingTimeAfterBot médio), em s
    resolutionRate: KpiValue; // 🆕 Taxa de Resolução (%)
    contacts: KpiValue;       // 🆕 Contatos (contactsCount)
    messages: KpiValue;       // 🆕 Mensagens (totalMessagesCount)
  };
  hourly: HourlyPoint[]; // série para o gráfico "Atendimentos ao longo do dia"
  agents: Agent[];       // lista usada no gráfico de produtividade e na tabela
  trend: TrendPoint[];   // série para o gráfico de tendência
}

// Lista fixa de nomes só para o mock parecer realista.
// (Nomes fictícios — os nomes/IDs reais ficam em `digisac-catalog.ts`.)
const AGENT_NAMES = [
  "Lucas",
  "Ana",
  "Manu",
];

/**
 * Gerador de números pseudo-aleatórios "com semente".
 * Usar uma semente garante que o MESMO período sempre produza os MESMOS
 * números — útil para a interface não ficar "pulando" a cada renderização.
 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Sementes distintas por período para que cada filtro mostre cenários diferentes.
const PERIOD_SEEDS: Record<PeriodKey, number> = {
  today: 42,
  yesterday: 73,
  "7d": 128,
  "30d": 256,
};

// Quantidade de dias coberta por cada período — multiplica o volume gerado.
const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 1,
  yesterday: 1,
  "7d": 7,
  "30d": 30,
};

/**
 * Cria um conjunto completo de dados simulados para o dashboard.
 * Não é chamada diretamente pela UI — é usada por `fetchDashboard()`
 * em `dashboard-api.ts` quando o modo mock está ativo.
 */
export function generateData(period: PeriodKey): DashboardData {
  const rand = seeded(PERIOD_SEEDS[period]);
  const days = PERIOD_DAYS[period];
  const scale = days; // multiplicador de volume conforme o período

  // Distribuição por hora — formato de "sino" com pico entre 10h e 16h,
  // simulando o horário comercial típico de um suporte.
  const hourly: HourlyPoint[] = Array.from({ length: 24 }, (_, h) => {
    const peak = Math.exp(-Math.pow((h - 13) / 4.5, 2));
    const base = peak * (40 + rand() * 30) * scale;
    return { hour: `${h.toString().padStart(2, "0")}h`, count: Math.round(base + rand() * 8) };
  });

  // KPIs derivados do volume horário.
  const total = hourly.reduce((s, p) => s + p.count, 0);
  const closed = Math.round(total * (0.78 + rand() * 0.1)); // ~78–88% fechados
  const dailyAvg = Math.round(total / days);                // média por dia

  // Gera métricas individuais para cada atendente e já ordena por fechamentos.
  const agents: Agent[] = AGENT_NAMES.map((name) => {
    const c = Math.round((closed / AGENT_NAMES.length) * (0.5 + rand() * 1.1));
    // 🆕 Mock agora também gera os tempos em segundos.
    const avgCloseSec = Math.round((8 + rand() * 22) * 60 + rand() * 59);
    const avgResponseSec = Math.round(60 + rand() * 600);
    const firstContactSec = Math.round(30 + rand() * 400);
    const totalCount = Math.round(c / (0.7 + rand() * 0.3));
    return {
      name,
      closed: c,
      avgTimeMin: Math.round(avgCloseSec / 60),
      resolutionRate: Math.round((75 + rand() * 22) * 10) / 10,
      avgResponseMin: Math.round((avgResponseSec / 60) * 10) / 10,
      firstContactMin: Math.round((firstContactSec / 60) * 10) / 10,
      avgCloseMin: Math.round(avgCloseSec / 60),
      avgTimeSec: avgCloseSec,
      avgResponseSec,
      firstContactSec,
      avgCloseSec,
      // 🆕 Indicadores extras por atendente (mock)
      total: totalCount,
      open: Math.max(0, totalCount - c),
      pteSec: Math.round(60 + rand() * 500),
      contacts: Math.round(c * (0.6 + rand() * 0.5)),
      messages: Math.round(c * (5 + rand() * 8)),
    };
  }).sort((a, b) => b.closed - a.closed);

  const closedPerAgent = Math.round(closed / agents.length);

  // Série temporal usada no gráfico de tendência (mínimo 7 pontos para visual).
  const trendDays = Math.max(days, 7);
  const trend: TrendPoint[] = Array.from({ length: trendDays }, (_, i) => {
    const dayLabel = `D-${trendDays - 1 - i}`;
    const abertos = Math.round(80 + rand() * 60);
    const fechados = Math.round(abertos * (0.7 + rand() * 0.25));
    const pendentes = Math.max(0, abertos - fechados + Math.round(rand() * 10));
    return { day: dayLabel, abertos, fechados, pendentes };
  });

  return {
    updatedAt: new Date().toISOString(),
    kpis: {
      total: { value: total, delta: Math.round((rand() * 30 - 10) * 10) / 10 },
      open: { value: Math.max(0, total - closed), delta: Math.round((rand() * 20 - 8) * 10) / 10 },
      closed: { value: closed, delta: Math.round((rand() * 25 - 5) * 10) / 10 },
      dailyAvg: { value: dailyAvg, delta: Math.round((rand() * 20 - 8) * 10) / 10 },
      closedPerAgent: { value: closedPerAgent, delta: Math.round((rand() * 20 - 8) * 10) / 10 },
      // 🆕 KPIs novos (tempos em segundos)
      tma: { value: Math.round(3600 * 6 + rand() * 3600), delta: Math.round((rand() * 20 - 10) * 10) / 10 },
      pte: { value: Math.round(300 + rand() * 900), delta: Math.round((rand() * 20 - 10) * 10) / 10 },
      tme: { value: Math.round(120 + rand() * 600), delta: Math.round((rand() * 20 - 10) * 10) / 10 },
      botWait: { value: Math.round(200 + rand() * 800), delta: Math.round((rand() * 20 - 10) * 10) / 10 },
      resolutionRate: { value: Math.round((80 + rand() * 20) * 10) / 10, delta: Math.round((rand() * 10 - 5) * 10) / 10 },
      contacts: { value: Math.round(total * (0.6 + rand() * 0.4)), delta: Math.round((rand() * 20 - 8) * 10) / 10 },
      messages: { value: Math.round(total * (6 + rand() * 6)), delta: Math.round((rand() * 20 - 8) * 10) / 10 },
    },
    hourly,
    agents,
    trend,
  };
}

// Rótulos amigáveis exibidos nos botões de filtro de período.
export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};