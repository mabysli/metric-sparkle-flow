// Mock data layer for the dashboard. In production replace with REST API calls.

export type PeriodKey = "today" | "yesterday" | "7d" | "30d";

export interface Agent {
  name: string;
  closed: number;
  avgTimeMin: number;
  resolutionRate: number;
}

export interface HourlyPoint {
  hour: string;
  count: number;
}

export interface TrendPoint {
  day: string;
  abertos: number;
  fechados: number;
  pendentes: number;
}

export interface DashboardData {
  updatedAt: string;
  kpis: {
    total: { value: number; delta: number };
    closed: { value: number; delta: number };
    transferred: { value: number; delta: number };
    dailyAvg: { value: number; delta: number };
    closedPerAgent: { value: number; delta: number };
  };
  hourly: HourlyPoint[];
  agents: Agent[];
  trend: TrendPoint[];
}

const AGENT_NAMES = [
  "Ana Silva",
  "Bruno Costa",
  "Carla Mendes",
  "Diego Ramos",
  "Eduarda Lima",
  "Felipe Souza",
  "Gabriela Rocha",
  "Henrique Alves",
];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const PERIOD_SEEDS: Record<PeriodKey, number> = {
  today: 42,
  yesterday: 73,
  "7d": 128,
  "30d": 256,
};

const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 1,
  yesterday: 1,
  "7d": 7,
  "30d": 30,
};

export function generateData(period: PeriodKey): DashboardData {
  const rand = seeded(PERIOD_SEEDS[period]);
  const days = PERIOD_DAYS[period];
  const scale = days;

  // Hourly distribution (bell-ish curve around 10h-16h)
  const hourly: HourlyPoint[] = Array.from({ length: 24 }, (_, h) => {
    const peak = Math.exp(-Math.pow((h - 13) / 4.5, 2));
    const base = peak * (40 + rand() * 30) * scale;
    return { hour: `${h.toString().padStart(2, "0")}h`, count: Math.round(base + rand() * 8) };
  });

  const total = hourly.reduce((s, p) => s + p.count, 0);
  const closed = Math.round(total * (0.78 + rand() * 0.1));
  const transferred = Math.round(total * (0.08 + rand() * 0.05));
  const dailyAvg = Math.round(total / days);

  const agents: Agent[] = AGENT_NAMES.map((name) => {
    const c = Math.round((closed / AGENT_NAMES.length) * (0.5 + rand() * 1.1));
    return {
      name,
      closed: c,
      avgTimeMin: Math.round(8 + rand() * 22),
      resolutionRate: Math.round((75 + rand() * 22) * 10) / 10,
    };
  }).sort((a, b) => b.closed - a.closed);

  const closedPerAgent = Math.round(closed / agents.length);

  // Trend
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
      transferred: { value: transferred, delta: Math.round((rand() * 20 - 10) * 10) / 10 },
      dailyAvg: { value: dailyAvg, delta: Math.round((rand() * 20 - 8) * 10) / 10 },
      closedPerAgent: { value: closedPerAgent, delta: Math.round((rand() * 20 - 8) * 10) / 10 },
    },
    hourly,
    agents,
    trend,
  };
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};
