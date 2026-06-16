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

import { generateData, type DashboardData, type PeriodKey } from "./dashboard-data";

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
  // Ex.: GET /metrics/dashboard?period=today
  dashboard: (period: PeriodKey) => `/metrics/dashboard?period=${period}`,
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
 * Função PÚBLICA usada pela UI (src/routes/index.tsx).
 * Retorna sempre um objeto `DashboardData` — independente da origem.
 *
 * @param period período selecionado no filtro do cabeçalho
 */
export async function fetchDashboard(period: PeriodKey): Promise<DashboardData> {
  // -----------------------------------------------------------------------
  // 🧪 MODO MOCK — gera dados simulados localmente
  // -----------------------------------------------------------------------
  if (USE_MOCK) {
    // Simulamos um pequeno atraso de rede para a UI exercitar o skeleton.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return generateData(period);
  }

  // -----------------------------------------------------------------------
  // 🌐 MODO PRODUÇÃO — chama a API real
  // -----------------------------------------------------------------------
  // Exemplo simples (um único endpoint que devolve tudo):
  return await apiGet<DashboardData>(ENDPOINTS.dashboard(period));

  // -----------------------------------------------------------------------
  // 💡 ALTERNATIVA — quando os dados vêm de VÁRIOS endpoints separados:
  //
  // const [kpis, hourly, agents, trend] = await Promise.all([
  //   apiGet<DashboardData["kpis"]>(`/metrics/kpis?period=${period}`),
  //   apiGet<DashboardData["hourly"]>(`/metrics/hourly?period=${period}`),
  //   apiGet<DashboardData["agents"]>(`/agents/ranking?period=${period}`),
  //   apiGet<DashboardData["trend"]>(`/metrics/trend?period=${period}`),
  // ]);
  // return { updatedAt: new Date().toISOString(), kpis, hourly, agents, trend };
  // -----------------------------------------------------------------------
}