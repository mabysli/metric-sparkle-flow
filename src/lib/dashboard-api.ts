/**
 * dashboard-api.ts
 * ============================================================================
 * 🔌 PONTO DE INTEGRAÇÃO COM A API REAL
 * ============================================================================
 *
 * Este arquivo é o ÚNICO local onde a aplicação fala com o backend.
 * Toda a tela (src/routes/index.tsx) chama `fetchDashboard(period)` sem
 * saber se os dados vêm de uma API real ou de dados simulados (mock).
 *
 * Isso é uma boa prática chamada "camada de serviço": separa a regra de
 * negócio (UI) da fonte de dados (API). Para conectar a um backend real
 * basta editar este arquivo — nenhum componente precisa ser alterado.
 *
 * --- COMO PLUGAR A API REAL ---------------------------------------------
 *
 * 1. Defina a URL base do backend em uma variável de ambiente:
 *
 *      // .env
 *      VITE_API_BASE_URL="https://api.suaempresa.com"
 *
 * 2. Troque `USE_MOCK` para `false` (ou apague o bloco do mock).
 *
 * 3. Ajuste os endpoints abaixo (`ENDPOINTS`) para refletir as rotas reais
 *    da sua API. O formato esperado de cada resposta está documentado em
 *    `DashboardData` (ver src/lib/dashboard-data.ts).
 *
 * 4. Se a API exigir autenticação (token JWT, API key, etc.), adicione os
 *    cabeçalhos no objeto `headers` dentro de `apiGet`.
 * ============================================================================
 */

import { generateData, type DashboardData, type DateRange, type PeriodKey } from "./dashboard-data";

/**
 * Alterne para `false` quando o backend estiver disponível.
 * Enquanto for `true`, a aplicação usa os dados simulados de
 * `dashboard-data.ts` — útil para desenvolvimento e demonstrações.
 */
const USE_MOCK = true;

/**
 * Base URL do backend. Lida da variável de ambiente do Vite,
 * com fallback para string vazia (não chama a API durante o mock).
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Mapa de rotas. Concentrar os caminhos em um único objeto facilita
 * trocar versões da API ou renomear endpoints sem caçar string pelo código.
 */
const ENDPOINTS = {
  // Ex.: GET /metrics/dashboard?period=today  (modo legado por período)
  dashboard: (period: PeriodKey) => `/metrics/dashboard?period=${period}`,
  // 🆕 Novo endpoint por intervalo de datas — usado pelo filtro de calendário.
  //    Ex.: GET /metrics/dashboard/range?from=2026-07-01&to=2026-07-08
  dashboardRange: (range: DateRange) =>
    `/metrics/dashboard/range?from=${range.from}&to=${range.to}`,
} as const;

/**
 * Função utilitária para chamadas GET. Centraliza:
 *  - montagem da URL completa
 *  - cabeçalhos padrão
 *  - tratamento de erros HTTP
 *
 * 👉 Para enviar token de autenticação, adicione algo como:
 *      headers: { Authorization: `Bearer ${seuToken}` }
 */
async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // Authorization: `Bearer ${token}`, // <- exemplo para auth
    },
  });

  // `fetch` NÃO lança erro automaticamente em status 4xx/5xx;
  // por isso fazemos a checagem manual aqui.
  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path} — HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * 🆕 Função PÚBLICA usada pela UI (src/routes/index.tsx).
 * Recebe um INTERVALO DE DATAS (from/to) escolhido no calendário do cabeçalho
 * e devolve os dados do dashboard.
 *
 * ⚠️ Ao integrar com a API real, garanta que o backend aceite `from` e `to`
 *    no mesmo formato ISO (YYYY-MM-DD) e devolva o shape `DashboardData`.
 *    O ranking de atendentes agora precisa incluir as novas métricas de tempo:
 *      - avgResponseMin   → tempo médio de resposta
 *      - firstContactMin  → tempo até o 1º contato humano após o bot
 *      - avgCloseMin      → tempo médio de fechamento do chamado
 *    E NÃO deve mais retornar `resolutionRate` nem o KPI `transferred`.
 */
export async function fetchDashboard(range: DateRange): Promise<DashboardData> {
  // -----------------------------------------------------------------------
  // 🧪 MODO MOCK — gera dados simulados localmente
  // -----------------------------------------------------------------------
  if (USE_MOCK) {
    // Simulamos um pequeno atraso de rede para a UI exercitar o skeleton.
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Converte o intervalo em um "período" só para variar a semente do mock.
    const days = Math.max(
      1,
      Math.round(
        (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000,
      ) + 1,
    );
    const period: PeriodKey = days <= 1 ? "today" : days <= 7 ? "7d" : "30d";
    return generateData(period);
  }

  // -----------------------------------------------------------------------
  // 🌐 MODO PRODUÇÃO — chama a API real com o intervalo de datas
  // -----------------------------------------------------------------------
  return await apiGet<DashboardData>(ENDPOINTS.dashboardRange(range));

  // -----------------------------------------------------------------------
  // 💡 ALTERNATIVA — quando os dados vêm de VÁRIOS endpoints separados:
  //
  // const qs = `?from=${range.from}&to=${range.to}`;
  // const [kpis, hourly, agents, trend] = await Promise.all([
  //   apiGet<DashboardData["kpis"]>(`/metrics/kpis${qs}`),
  //   apiGet<DashboardData["hourly"]>(`/metrics/hourly${qs}`),
  //   // 👉 este endpoint deve devolver as novas métricas de tempo por atendente:
  //   apiGet<DashboardData["agents"]>(`/agents/ranking${qs}`),
  //   apiGet<DashboardData["trend"]>(`/metrics/trend${qs}`),
  // ]);
  // return { updatedAt: new Date().toISOString(), kpis, hourly, agents, trend };
  // -----------------------------------------------------------------------
}