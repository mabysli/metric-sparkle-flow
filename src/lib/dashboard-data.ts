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
// 🆕 Ampliada para 12 atendentes — o gráfico de produtividade agora exibe TODOS.
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
};
