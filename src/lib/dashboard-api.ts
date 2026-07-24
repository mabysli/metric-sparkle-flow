/**
 * dashboard-api.ts
 * ============================================================================
 * 🔌 PONTO DE INTEGRAÇÃO COM A API REAL (DIGISAC)
 * ============================================================================
 *
 * Toda a tela (src/routes/index.tsx) chama `fetchDashboard(range)` sem
 * saber se os dados vêm de uma API real ou de dados simulados (mock).
 *
 * ============================================================================
 * 🚨 SOBRE O FORMATO REAL DA RESPOSTA (confirmado por você)
 * ============================================================================
 *
 * `/dashboard/general` (sem `grouping`) devolve um objeto ÚNICO com totais
 * do período, algo assim:
 *
 *   {
 *     sentMessagesCount, receivedMessagesCount, totalMessagesCount,
 *     openedTicketsCount, closedTicketsCount, totalTicketsCount,
 *     waitingTime, waitingTimeAfterBot, waitingTimeAvg,
 *     ticketTime, contactsCount
 *   }
 *
 * Repare que NÃO existe um campo "transferido" nem quebra por hora/dia/
 * atendente nessa resposta — é só o agregado do intervalo pedido. Por isso:
 *
 *   1) O KPI "Transferidos" foi REMOVIDO do dashboard (não há dado pra isso
 *      na API — se você souber de outro endpoint/campo da Digisac pra
 *      transferências, me avise que eu conecto).
 *
 *   2) Para o RANKING DE ATENDENTES, fazemos uma chamada por atendente
 *      (filtrando por `userId`, usando a lista real em `digisac-catalog.ts`)
 *      e montamos a lista a partir dos totais de cada um.
 *
 *   3) Para a TENDÊNCIA POR DIA e o GRÁFICO POR HORA, tentamos primeiro usar
 *      o parâmetro `grouping` (ex.: `grouping=day`, `grouping=hour`) — SE a
 *      API devolver um array agrupado, usamos direto (mais rápido). Se não
 *      devolver array (ainda não confirmamos se `grouping` funciona assim),
 *      caímos automaticamente para várias chamadas (uma por dia, e uma por
 *      hora somente quando o período é de 1 dia — pra não gerar chamadas
 *      demais em períodos de 30 dias).
 *
 *   👉 Se você testar `grouping=day` ou `grouping=hour` no Postman e a
 *      resposta vier como array, me manda um exemplo — aí eu confirmo o
 *      mapeamento de `toTrendPoint`/`toHourlyPoint` com precisão e a gente
 *      reduz bastante o número de chamadas.
 *
 * ⚠️ Todas essas chamadas extras (atendentes + fallback por dia/hora) têm
 * custo: no pior caso (período de 30 dias, sem `grouping` funcionando) dá
 * ~1 (atual) + 1 (anterior, p/ delta) + 14 (atendentes) + 30 (tendência) =
 * ~46 chamadas em paralelo. Funciona, mas se ficar lento vale a pena
 * confirmar se `grouping` resolve isso com menos chamadas.
 *
 * --- ARQUIVO .env NECESSÁRIO NA RAIZ DO PROJETO ---------------------------
 *
 *      VITE_API_BASE_URL="https://ikatec.digisac.chat/api/v1"
 *      VITE_API_TOKEN="SEU_TOKEN_AQUI"
 *
 *   ⚠️ ".env" no .gitignore. Nunca deixe o token literal no código.
 *
 * ----------------------------------------------------------------------
 * 🔧 AÇÕES REALIZADAS NESTA REVISÃO (resolução de merge + integração API)
 * ----------------------------------------------------------------------
 *   1) Havia 5 blocos de conflito de merge não resolvidos neste arquivo
 *      (imports, `DashboardFilters`/`DigisacTotals`/rotas, e duas versões
 *      de `fetchDashboard`). Todos foram resolvidos abaixo.
 *   2) A branch "HEAD" já tinha a integração certa com o endpoint real
 *      `/dashboard/general` (bate 100% com a requisição de exemplo que
 *      você mandou: mesmos query params e mesmo formato de resposta) —
 *      essa foi a base escolhida para as chamadas HTTP.
 *   3) A outra branch trocou o filtro de "período fixo" (`PeriodKey`) por
 *      um calendário de intervalo (`DateRange`, de/até) — isso foi
 *      mantido, já que é o que a tela mais nova usa. `fetchDashboard`
 *      agora recebe `DateRange` só que por baixo dos panos ele converte
 *      pra `startPeriod`/`endPeriod` (ISO) e chama a API real do jeito
 *      que já estava confirmado.
 *   4) A outra branch também apontava pra endpoints fictícios
 *      (`/metrics/dashboard`, `/metrics/dashboard/range`) que não existem
 *      de verdade — foram removidos em favor do `/dashboard/general` real.
 *   5) Criado o arquivo `digisac-catalog.ts` (era importado mas não
 *      existia) com o departamento e os 14 atendentes reais que você
 *      passou (nome + userId).
 *   6) `buildKpis` não gera mais o campo `transferred` (removido também
 *      de `DashboardData` em `dashboard-data.ts`).
 *   7) `fetchAgentsRanking` agora preenche as novas métricas de tempo do
 *      `Agent` (`avgResponseMin`, `firstContactMin`, `avgCloseMin`) a
 *      partir dos campos reais da API (`waitingTimeAvg`,
 *      `waitingTimeAfterBot`, `ticketTime`) — ver comentários no corpo da
 *      função sobre como cada um foi calculado, e onde ainda é uma
 *      aproximação por falta de campo específico na API.
 * ============================================================================
 */

import {
  type DashboardData,
  type DateRange,
  type PeriodKey,
  type Agent,
  type HourlyPoint,
  type TrendPoint,
  generateData,
} from "./dashboard-data";
import { AGENTS, DEFAULT_DEPARTMENT_ID } from "./digisac-catalog";

const USE_MOCK = false;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://ikatec.digisac.chat/api/v1";
// ⚠️ Token colocado direto aqui a pedido — se este arquivo for pra um
// repositório Git ou for compartilhado, ele fica exposto para quem tiver
// acesso. Se quiser reverter, troque o fallback de volta para "".
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "07df67a7ceb16fbf4d334d540ec26b5fb71f83fd";

export interface DashboardFilters {
  departmentId?: string;
  userId?: string;
  serviceId?: string;
  periodType?: "open" | "close";
  status?: "all" | "open" | "close";
  departmentParticipation?: "last" | "middle";
  userParticipation?: "last" | "middle";
}

/** Formato REAL confirmado da resposta de `/dashboard/general` (sem grouping). */
interface DigisacTotals {
  sentMessagesCount: number;
  receivedMessagesCount: number;
  totalMessagesCount: number;
  openedTicketsCount: number;
  closedTicketsCount: number;
  totalTicketsCount: number;
  waitingTime: number;
  waitingTimeAfterBot: number;
  waitingTimeAvg: number;
  ticketTime: number;
  contactsCount: number;
}

// Mantido só para o modo mock (converter dias -> "período" e escolher a semente).
const PERIOD_DAYS_MAP: Record<PeriodKey, number> = {
  today: 1,
  yesterday: 1,
  "7d": 7,
  "30d": 30,
};

// ---------------------------------------------------------------------------
// Cálculo de intervalos de data
// ---------------------------------------------------------------------------

function startOfDayUTC(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfDayUTC(d: Date) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

/** Quantos dias o `DateRange` cobre (inclusivo nas duas pontas). */
function daysBetween(range: DateRange): number {
  const start = startOfDayUTC(new Date(`${range.from}T00:00:00.000Z`)).getTime();
  const end = startOfDayUTC(new Date(`${range.to}T00:00:00.000Z`)).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/** Converte o `DateRange` (from/to em YYYY-MM-DD) em instantes ISO completos para a API. */
function getRangeAsISO(range: DateRange): { startPeriod: string; endPeriod: string } {
  return {
    startPeriod: startOfDayUTC(new Date(`${range.from}T00:00:00.000Z`)).toISOString(),
    endPeriod: endOfDayUTC(new Date(`${range.to}T00:00:00.000Z`)).toISOString(),
  };
}

/** Intervalo imediatamente anterior, com a mesma duração — usado pro delta (%) dos KPIs. */
function getPreviousPeriodISO(range: DateRange): { startPeriod: string; endPeriod: string } {
  const lengthDays = daysBetween(range);
  const { startPeriod } = getRangeAsISO(range);
  const prevEnd = new Date(startPeriod);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevEndFinal = endOfDayUTC(prevEnd);
  const prevStart = new Date(prevEndFinal);
  prevStart.setUTCDate(prevStart.getUTCDate() - (lengthDays - 1));
  return { startPeriod: startOfDayUTC(prevStart).toISOString(), endPeriod: prevEndFinal.toISOString() };
}

function eachDayInRange(startISO: string, endISO: string): { start: string; end: string }[] {
  const end = new Date(endISO);
  const cursor = startOfDayUTC(new Date(startISO));
  const days: { start: string; end: string }[] = [];
  while (cursor <= end) {
    days.push({ start: startOfDayUTC(cursor).toISOString(), end: endOfDayUTC(cursor).toISOString() });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function eachHourInDay(dayStartISO: string): { start: string; end: string }[] {
  const base = startOfDayUTC(new Date(dayStartISO));
  return Array.from({ length: 24 }, (_, h) => {
    const s = new Date(base);
    s.setUTCHours(h, 0, 0, 0);
    const e = new Date(base);
    e.setUTCHours(h, 59, 59, 999);
    return { start: s.toISOString(), end: e.toISOString() };
  });
}

// ---------------------------------------------------------------------------
// Chamadas HTTP
// ---------------------------------------------------------------------------

function buildQuery(startPeriod: string, endPeriod: string, grouping: string, filters: DashboardFilters = {}) {
  const params = new URLSearchParams();
  params.set("startPeriod", startPeriod);
  params.set("endPeriod", endPeriod);
  // 👉 "grouping" sempre vai na URL, mesmo vazio — foi assim na requisição real.
  params.set("grouping", grouping);
  // 👉 Por padrão filtra pelo departamento "Fila Suporte - Digisac" (confirmado
  //    na requisição real), não pelo geral/vazio. Passe `departmentId` em
  //    `filters` pra sobrescrever (ex.: incluir o "Robô" também).
  params.set("departmentId", filters.departmentId ?? DEFAULT_DEPARTMENT_ID);
  // 👉 "all" (literal), não vazio.
  params.set("userId", filters.userId ?? "all");
  params.set("periodType", `${filters.periodType ?? "close"}Date`);
  params.set("departmentParticipation", filters.departmentParticipation ?? "last");
  // 👉 "all" (literal) é o padrão real, não "last".
  params.set("userParticipation", filters.userParticipation ?? "all");
  params.set("status", filters.status ?? "all");
  // 👉 "serviceId" só entra na URL quando informado — na requisição real ele
  //    nem aparece quando não usado (diferente de ir vazio).
  if (filters.serviceId) {
    params.set("serviceId", filters.serviceId);
  }
  return `/dashboard/general?${params.toString()}`;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Falha ao chamar ${path} — HTTP ${response.status}${errorBody ? ` — ${errorBody}` : ""}`
    );
  }

  return (await response.json()) as T;
}

function fetchTotals(startPeriod: string, endPeriod: string, filters?: DashboardFilters): Promise<DigisacTotals> {
  return apiGet<DigisacTotals>(buildQuery(startPeriod, endPeriod, "", filters));
}

/** Tenta pedir já agrupado (day/hour). Pode devolver array OU um objeto único — tratamos os dois casos. */
function fetchGrouped(
  startPeriod: string,
  endPeriod: string,
  grouping: "day" | "hour",
  filters?: DashboardFilters
): Promise<DigisacTotals | DigisacTotals[]> {
  return apiGet<DigisacTotals | DigisacTotals[]>(buildQuery(startPeriod, endPeriod, grouping, filters));
}

// ---------------------------------------------------------------------------
// Montagem dos pedaços do DashboardData
// ---------------------------------------------------------------------------

function pctDelta(curr: number, prev: number): number {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

/** ❌ Não gera mais `transferred` — a API não devolve esse dado (ver cabeçalho do arquivo). */
function buildKpis(current: DigisacTotals, previous: DigisacTotals | null, agentsCount: number, days: number) {
  const total = current.totalTicketsCou/**
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
// ⚠️ Mantido apenas por compatibilidade — o filtro visual agora é um
// intervalo de datas (ver `DateRange` abaixo e `src/routes/index.tsx`).
export type PeriodKey = "today" | "yesterday" | "7d" | "30d";

/**
 * 🆕 Intervalo de datas selecionado pelo usuário no calendário do cabeçalho.
 * `from` e `to` são strings ISO (YYYY-MM-DD). O backend deve interpretar
 * como intervalo inclusivo.
 */
export interface DateRange {
  from: string; // data inicial (YYYY-MM-DD)
  to: string;   // data final   (YYYY-MM-DD)
}

/** Métricas individuais de um atendente (linha do ranking). */
export interface Agent {
  name: string;              // nome do atendente
  closed: number;            // total de chamados fechados no período
  avgTimeMin: number;        // tempo médio de atendimento em minutos
  // 🆕 Novas métricas de tempo pedidas na revisão do dashboard.
  // Todas em MINUTOS para ficar consistente com `avgTimeMin`.
  avgResponseMin: number;    // tempo médio de resposta do chamado
  firstContactMin: number;   // tempo até o 1º contato humano após o bot
  avgCloseMin: number;       // tempo médio até o fechamento do chamado
  // ❌ Removido: `resolutionRate` — o ranking não exibe mais taxa de resolução.
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

/** Estrutura completa retornada pela API/mock para a tela do dashboard. */
export interface DashboardData {
  updatedAt: string; // ISO timestamp — usado no cabeçalho "Última atualização"
  kpis: {
    // Cada KPI tem o valor atual + variação (%) em relação ao período anterior.
    total: { value: number; delta: number };
    closed: { value: number; delta: number };
    // ❌ Removido: `transferred` — o KPI de "Chamados Transferidos" foi retirado.
    dailyAvg: { value: number; delta: number };
    closedPerAgent: { value: number; delta: number };
  };
  hourly: HourlyPoint[]; // série para o gráfico "Atendimentos ao longo do dia"
  agents: Agent[];       // lista usada no gráfico de produtividade e na tabela
  trend: TrendPoint[];   // série para o gráfico de tendência
}

// Lista fixa de nomes só para o mock parecer realista.
// 🆕 Ampliada — o gráfico de produtividade agora exibe TODOS os atendentes.
// (Nomes fictícios — os nomes/IDs reais ficam em `digisac-catalog.ts`.)
const AGENT_NAMES = [
  "Ana Silva",
  "Bruno Costa",
  "Carla Mendes",
  "Diego Ramos",
  "Eduarda Lima",
  "Felipe Souza",
  "Gabriela Rocha",
  "Henrique Alves",
  "Isabela Prado",
  "João Martins",
  "Karina Duarte",
  "Lucas Ferreira",
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
  const closed = Math.round(total * (0.78 + rand() * 0.1));        // ~78–88% fechados
  const dailyAvg = Math.round(total / days);                       // média por dia

  // Gera métricas individuais para cada atendente e já ordena por fechamentos.
  // 🆕 Também gera as novas métricas de tempo (resposta, 1º contato, fechamento).
  const agents: Agent[] = AGENT_NAMES.map((name) => {
    const c = Math.round((closed / AGENT_NAMES.length) * (0.5 + rand() * 1.1));
    return {
      name,
      closed: c,
      avgTimeMin: Math.round(8 + rand() * 22),
      avgResponseMin: Math.round((1 + rand() * 5) * 10) / 10,   // 1–6 min
      firstContactMin: Math.round((0.5 + rand() * 3) * 10) / 10, // 0,5–3,5 min
      avgCloseMin: Math.round(20 + rand() * 90),                 // 20–110 min
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
      closed: { value: closed, delta: Math.round((rand() * 25 - 5) * 10) / 10 },
      dailyAvg: { value: dailyAvg, delta: Math.round((rand() * 20 - 8) * 10) / 10 },
      closedPerAgent: { value: closedPerAgent, delta: Math.round((rand() * 20 - 8) * 10) / 10 },
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
};nt;
  const closed = current.closedTicketsCount;
  const dailyAvg = days ? Math.round(total / days) : total;
  const prevDailyAvg = previous && days ? Math.round(previous.totalTicketsCount / days) : 0;
  const closedPerAgent = agentsCount ? Math.round(closed / agentsCount) : 0;

  return {
    total: { value: total, delta: previous ? pctDelta(total, previous.totalTicketsCount) : 0 },
    closed: { value: closed, delta: previous ? pctDelta(closed, previous.closedTicketsCount) : 0 },
    dailyAvg: { value: dailyAvg, delta: previous ? pctDelta(dailyAvg, prevDailyAvg) : 0 },
    closedPerAgent: { value: closedPerAgent, delta: 0 },
  };
}

/**
 * Monta o ranking chamando `/dashboard/general` uma vez por atendente
 * (filtrando por `userId`), usando a lista real de `digisac-catalog.ts`.
 *
 * Mapeamento das novas métricas de tempo (a API não tem campos com esses
 * nomes exatos, então aproximamos a partir do que ela devolve):
 *   - avgResponseMin  ← `waitingTimeAvg` (já vem como média, só convertemos p/ minutos)
 *   - firstContactMin ← `waitingTimeAfterBot` dividido pelo nº de chamados fechados
 *   - avgCloseMin     ← `ticketTime` dividido pelo nº de chamados fechados
 *   - avgTimeMin (campo legado) ← mesmo cálculo de `avgCloseMin`, por enquanto
 *     (a API não distingue "tempo de atendimento" de "tempo até o fechamento";
 *     se a Digisac expuser um campo específico pra isso, é só trocar aqui).
 */
async function fetchAgentsRanking(
  startPeriod: string,
  endPeriod: string,
  filters?: DashboardFilters
): Promise<Agent[]> {
  const results = await Promise.all(
    AGENTS.map(async (agent) => {
      try {
        const t = await fetchTotals(startPeriod, endPeriod, { ...filters, userId: agent.id });
        const closedCount = t.closedTicketsCount || 0;
        const avgTicketMin = closedCount ? Math.round((t.ticketTime / closedCount / 60) * 10) / 10 : 0;

        return {
          name: agent.name,
          closed: closedCount,
          avgTimeMin: avgTicketMin,
          avgResponseMin: Math.round((t.waitingTimeAvg / 60) * 10) / 10,
          firstContactMin: closedCount ? Math.round((t.waitingTimeAfterBot / closedCount / 60) * 10) / 10 : 0,
          avgCloseMin: avgTicketMin,
        } satisfies Agent;
      } catch {
        // Se um atendente falhar (ex.: sem tickets no período), não derruba o dashboard inteiro.
        return null;
      }
    })
  );

  return results.filter((a): a is Agent => a !== null).sort((a, b) => b.closed - a.closed);
}

function toTrendPoint(t: DigisacTotals, index: number, total: number): TrendPoint {
  return {
    day: `D-${total - 1 - index}`,
    abertos: t.openedTicketsCount,
    fechados: t.closedTicketsCount,
    // 👉 Não há campo "pendente" explícito — aproximamos como total menos fechados.
    pendentes: Math.max(0, t.totalTicketsCount - t.closedTicketsCount),
  };
}

async function fetchTrendPoints(
  startPeriod: string,
  endPeriod: string,
  filters?: DashboardFilters
): Promise<TrendPoint[]> {
  const grouped = await fetchGrouped(startPeriod, endPeriod, "day", filters).catch(() => null);
  if (Array.isArray(grouped) && grouped.length) {
    return grouped.map((g, i) => toTrendPoint(g, i, grouped.length));
  }

  // Fallback: uma chamada por dia dentro do período.
  const days = eachDayInRange(startPeriod, endPeriod);
  const results = await Promise.all(days.map((d) => fetchTotals(d.start, d.end, filters)));
  return results.map((r, i) => toTrendPoint(r, i, results.length));
}

async function fetchHourlyPoints(
  startPeriod: string,
  endPeriod: string,
  filters?: DashboardFilters
): Promise<HourlyPoint[]> {
  const grouped = await fetchGrouped(startPeriod, endPeriod, "hour", filters).catch(() => null);
  if (Array.isArray(grouped) && grouped.length) {
    return grouped.map((g, h) => ({ hour: `${h.toString().padStart(2, "0")}h`, count: g.totalTicketsCount }));
  }

  const days = eachDayInRange(startPeriod, endPeriod);
  if (days.length > 1) {
    // Evita 24 x N chamadas em períodos longos. Fica zerado até `grouping=hour` ser confirmado.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[Digisac] grouping=hour não devolveu array — gráfico por hora desativado para períodos > 1 dia.");
    }
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h.toString().padStart(2, "0")}h`, count: 0 }));
  }

  const hours = eachHourInDay(startPeriod);
  const results = await Promise.all(hours.map((h) => fetchTotals(h.start, h.end, filters)));
  return results.map((r, h) => ({ hour: `${h.toString().padStart(2, "0")}h`, count: r.totalTicketsCount }));
}

// ---------------------------------------------------------------------------
// Função pública usada pela UI
// ---------------------------------------------------------------------------

/**
 * Função PÚBLICA usada pela UI (src/routes/index.tsx).
 * Recebe o INTERVALO DE DATAS (from/to) escolhido no calendário do
 * cabeçalho e devolve os dados do dashboard — já convertendo por baixo
 * dos panos para `startPeriod`/`endPeriod` no formato que a API real espera.
 */
export async function fetchDashboard(range: DateRange, filters?: DashboardFilters): Promise<DashboardData> {
  // -----------------------------------------------------------------------
  // 🧪 MODO MOCK — gera dados simulados localmente
  // -----------------------------------------------------------------------
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Converte o intervalo em um "período" só para variar a semente do mock.
    const days = daysBetween(range);
    const period: PeriodKey =
      days <= 1 ? "today" : days <= PERIOD_DAYS_MAP["7d"] ? "7d" : "30d";
    return generateData(period);
  }

  // -----------------------------------------------------------------------
  // 🌐 MODO PRODUÇÃO — chama a API real (`/dashboard/general`) com o
  // intervalo de datas convertido para `startPeriod`/`endPeriod` ISO.
  // -----------------------------------------------------------------------
  const { startPeriod, endPeriod } = getRangeAsISO(range);
  const { startPeriod: prevStart, endPeriod: prevEnd } = getPreviousPeriodISO(range);

  const [current, previous, agents, trend, hourly] = await Promise.all([
    fetchTotals(startPeriod, endPeriod, filters),
    fetchTotals(prevStart, prevEnd, filters).catch(() => null),
    fetchAgentsRanking(startPeriod, endPeriod, filters),
    fetchTrendPoints(startPeriod, endPeriod, filters),
    fetchHourlyPoints(startPeriod, endPeriod, filters),
  ]);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[Digisac] totais do período atual:", current);
    // eslint-disable-next-line no-console
    console.log("[Digisac] totais do período anterior (delta):", previous);
  }

  return {
    updatedAt: new Date().toISOString(),
    kpis: buildKpis(current, previous, agents.length, daysBetween(range)),
    hourly,
    agents,
    trend,
  };
}