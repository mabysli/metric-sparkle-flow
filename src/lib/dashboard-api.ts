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
 * 🔧 Notas desta revisão
 * ----------------------------------------------------------------------
 *   - O filtro de "período fixo" (`PeriodKey`) foi trocado por um
 *     calendário de intervalo (`DateRange`, de/até). `fetchDashboard` agora
 *     recebe `DateRange` e converte internamente para `startPeriod`/
 *     `endPeriod` (ISO) antes de chamar a API real.
 *   - `buildKpis` não gera mais o campo `transferred` (removido também de
 *     `DashboardData` em `dashboard-data.ts`).
 *   - `fetchAgentsRanking` preenche as novas métricas de tempo do `Agent`
 *     (`avgResponseMin`, `firstContactMin`, `avgCloseMin`) a partir dos
 *     campos reais da API (`waitingTimeAvg`, `waitingTimeAfterBot`,
 *     `ticketTime`) — ver comentários no corpo da função sobre como cada
 *     um foi calculado, e onde ainda é uma aproximação por falta de campo
 *     específico na API.
 * ============================================================================
 */

import {
  type DashboardData,
  type DateRange,
  type PeriodKey,
  type Agent,
  type AgentProgressPoint,
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

/**
 * Converte o `DateRange` em instantes ISO completos para a API.
 * 🆕 (ALTERAÇÃO) Agora respeita as HORAS escolhidas no filtro
 * (`fromTime`/`toTime`, formato "HH:MM"). Sem horas → 00:00 até 23:59:59.
 */
function getRangeAsISO(range: DateRange): { startPeriod: string; endPeriod: string } {
  const start = range.fromTime
    ? new Date(`${range.from}T${range.fromTime}:00.000Z`)
    : startOfDayUTC(new Date(`${range.from}T00:00:00.000Z`));
  const end = range.toTime
    ? new Date(`${range.to}T${range.toTime}:59.999Z`)
    : endOfDayUTC(new Date(`${range.to}T00:00:00.000Z`));
  return { startPeriod: start.toISOString(), endPeriod: end.toISOString() };
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
  // 👉 Fixado em "closeDate" (data de fechamento) — confirmado na requisição
  //    real enviada por você. `filters.periodType` deixou de ser usado aqui.
  params.set("periodType", "closeDate");
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
  // 🆕 (ALTERAÇÃO DESTA REVISÃO — "arrumar as requisições")
  // Antes cada componente disparava a mesma URL várias vezes (ranking,
  // tendência, progresso do atendente...). Agora existe um CACHE em memória
  // por URL com validade curta: chamadas idênticas feitas no mesmo minuto
  // reaproveitam a resposta em vez de bater na API de novo.
  const cached = getCached<T>(path);
  if (cached) return cached;
  const promise = requestQueue(() => rawGet<T>(path));
  setCached(path, promise);
  // Se falhar, tira do cache pra permitir nova tentativa.
  promise.catch(() => REQUEST_CACHE.delete(path));
  return promise;
}

// --- Cache simples em memória (chave = caminho da requisição) --------------
const CACHE_TTL_MS = 55_000; // um pouco menor que o auto-refresh de 60s
const REQUEST_CACHE = new Map<string, { at: number; promise: Promise<unknown> }>();

function getCached<T>(key: string): Promise<T> | null {
  const hit = REQUEST_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    REQUEST_CACHE.delete(key);
    return null;
  }
  return hit.promise as Promise<T>;
}

function setCached(key: string, promise: Promise<unknown>) {
  REQUEST_CACHE.set(key, { at: Date.now(), promise });
}

// --- Fila com concorrência limitada ---------------------------------------
// A API não gosta de dezenas de chamadas simultâneas (o dashboard chegava a
// disparar ~100 de uma vez e algumas voltavam com erro/lentidão). Aqui
// limitamos a 6 requisições ao mesmo tempo; as demais esperam a vez.
const MAX_CONCURRENT = 6;
let running = 0;
const waiting: (() => void)[] = [];

function requestQueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = async () => {
      running++;
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      } finally {
        running--;
        waiting.shift()?.();
      }
    };
    if (running < MAX_CONCURRENT) run();
    else waiting.push(run);
  });
}

async function rawGet<T>(path: string): Promise<T> {
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

/**
 * ❌ Não gera mais `transferred` — a API não devolve esse dado.
 *
 * 🆕 (ALTERAÇÃO DESTA REVISÃO) Passou a montar TODAS as variáveis da imagem
 * enviada, direto dos campos reais de `/dashboard/general`:
 *   - Total Atendido     ← totalTicketsCount
 *   - Chamados Abertos   ← openedTicketsCount
 *   - Chamados Fechados  ← closedTicketsCount
 *   - TMA (s)            ← ticketTime / chamados fechados
 *   - PTE (s)            ← waitingTime / chamados totais
 *   - TME (s)            ← waitingTimeAvg (já é média)
 *   - Espera após Bot (s)← waitingTimeAfterBot / chamados totais
 *   - Taxa de Resolução  ← fechados / total * 100
 *   - Contatos           ← contactsCount
 *   - Mensagens          ← totalMessagesCount
 * Todos os tempos ficam em SEGUNDOS e são formatados na tela.
 */
function buildKpis(current: DigisacTotals, previous: DigisacTotals | null, agentsCount: number, days: number) {
  const total = current.totalTicketsCount;
  const open = current.openedTicketsCount;
  const closed = current.closedTicketsCount;
  const dailyAvg = days ? Math.round(total / days) : total;
  const prevDailyAvg = previous && days ? Math.round(previous.totalTicketsCount / days) : 0;
  const closedPerAgent = agentsCount ? Math.round(closed / agentsCount) : 0;

  // Helpers de média (evitam divisão por zero).
  const avg = (value: number, count: number) => (count ? Math.round(value / count) : 0);
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  const tma = avg(current.ticketTime, closed);
  const pte = avg(current.waitingTime, total);
  const tme = Math.round(current.waitingTimeAvg);
  const botWait = avg(current.waitingTimeAfterBot, total);
  const resolutionRate = rate(closed, total);

  // Mesmos cálculos no período anterior, para os deltas (%).
  const p = previous;
  const pTotal = p?.totalTicketsCount ?? 0;
  const pClosed = p?.closedTicketsCount ?? 0;

  return {
    total: { value: total, delta: p ? pctDelta(total, pTotal) : 0 },
    open: { value: open, delta: p ? pctDelta(open, p.openedTicketsCount) : 0 },
    closed: { value: closed, delta: p ? pctDelta(closed, pClosed) : 0 },
    dailyAvg: { value: dailyAvg, delta: p ? pctDelta(dailyAvg, prevDailyAvg) : 0 },
    closedPerAgent: { value: closedPerAgent, delta: 0 },
    tma: { value: tma, delta: p ? pctDelta(tma, avg(p.ticketTime, pClosed)) : 0 },
    pte: { value: pte, delta: p ? pctDelta(pte, avg(p.waitingTime, pTotal)) : 0 },
    tme: { value: tme, delta: p ? pctDelta(tme, Math.round(p.waitingTimeAvg)) : 0 },
    botWait: { value: botWait, delta: p ? pctDelta(botWait, avg(p.waitingTimeAfterBot, pTotal)) : 0 },
    resolutionRate: { value: resolutionRate, delta: p ? pctDelta(resolutionRate, rate(pClosed, pTotal)) : 0 },
    contacts: { value: current.contactsCount, delta: p ? pctDelta(current.contactsCount, p.contactsCount) : 0 },
    messages: {
      value: current.totalMessagesCount,
      delta: p ? pctDelta(current.totalMessagesCount, p.totalMessagesCount) : 0,
    },
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
        const totalCount = t.totalTicketsCount || 0;
        // 🆕 (ALTERAÇÃO) Guardamos os tempos em SEGUNDOS (sem arredondar para
        //    minutos) para conseguir exibir "10m 1s" na tabela do ranking.
        const avgCloseSec = closedCount ? Math.round(t.ticketTime / closedCount) : 0;
        const avgResponseSec = Math.round(t.waitingTimeAvg || 0);
        const firstContactSec = closedCount ? Math.round(t.waitingTimeAfterBot / closedCount) : 0;
        const avgTicketMin = Math.round((avgCloseSec / 60) * 10) / 10;
        // 👉 A API não devolve uma "taxa de resolução" pronta; aproximamos
        //    como fechados / total de chamados do atendente no período.
        const resolutionRate = totalCount ? Math.round((closedCount / totalCount) * 1000) / 10 : 0;

        return {
          name: agent.name,
          closed: closedCount,
          avgTimeMin: avgTicketMin,
          resolutionRate,
          avgResponseMin: Math.round((avgResponseSec / 60) * 10) / 10,
          firstContactMin: Math.round((firstContactSec / 60) * 10) / 10,
          avgCloseMin: avgTicketMin,
          avgTimeSec: avgCloseSec,
          avgResponseSec,
          firstContactSec,
          avgCloseSec,
          // 🆕 (ALTERAÇÃO DESTA REVISÃO) Indicadores da grade de KPIs agora
          //    também POR ATENDENTE, para aparecerem no ranking:
          total: totalCount,                                   // ← totalTicketsCount
          open: t.openedTicketsCount || 0,                     // ← openedTicketsCount
          pteSec: totalCount ? Math.round(t.waitingTime / totalCount) : 0, // ← waitingTime médio
          contacts: t.contactsCount || 0,                      // ← contactsCount
          messages: t.totalMessagesCount || 0,                 // ← totalMessagesCount
        } satisfies Agent;
      } catch {
        // Se um atendente falhar (ex.: sem tickets no período), não derruba o dashboard inteiro.
        return null;
      }
    })
  );

  return results
    .filter((a): a is NonNullable<(typeof results)[number]> => a !== null)
    .sort((a, b) => b.closed - a.closed);
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

/* ============================================================================
 * 🆕 (ALTERAÇÃO DESTA REVISÃO) PROGRESSO DE UM ATENDENTE AO LONGO DOS DIAS
 * ============================================================================
 * Usada pelo novo gráfico "Progresso do Atendente" (src/routes/index.tsx),
 * onde o usuário escolhe o NOME do atendente e vê a evolução dele dia a dia
 * dentro do intervalo filtrado no calendário.
 *
 * 🔌 INTEGRAÇÃO: fazemos UMA chamada a `/dashboard/general` por DIA do
 * período, filtrando por `userId` do atendente escolhido (a API não devolve
 * série temporal por atendente em uma única chamada). Se um dia
 * `grouping=day` + `userId` passar a devolver um array, dá para trocar o
 * laço abaixo por uma única chamada — o formato de saída continua o mesmo.
 */
export async function fetchAgentProgress(
  range: DateRange,
  agentName: string,
  filters?: DashboardFilters
): Promise<AgentProgressPoint[]> {
  const { startPeriod, endPeriod } = getRangeAsISO(range);
  const days = eachDayInRange(startPeriod, endPeriod);
  const label = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  // 🧪 MODO MOCK — série pseudo-aleatória só para a tela ter o que mostrar.
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return days.map((d, i) => {
      const total = 8 + ((i * 7 + agentName.length) % 12);
      return {
        date: label(d.start),
        total,
        closed: Math.max(0, total - (i % 3)),
        avgCloseSec: 600 + ((i * 137) % 1800),
      };
    });
  }

  const agent = AGENTS.find((a) => a.name === agentName);
  if (!agent) return [];

  const results = await Promise.all(
    days.map(async (d) => {
      try {
        const t = await fetchTotals(d.start, d.end, { ...filters, userId: agent.id });
        const closed = t.closedTicketsCount || 0;
        return {
          date: label(d.start),
          total: t.totalTicketsCount || 0,
          closed,
          avgCloseSec: closed ? Math.round(t.ticketTime / closed) : 0,
        } satisfies AgentProgressPoint;
      } catch {
        return { date: label(d.start), total: 0, closed: 0, avgCloseSec: 0 };
      }
    })
  );
  return results;
}