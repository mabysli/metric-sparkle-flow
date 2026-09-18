/**
 * digisac-catalog.ts
 * ============================================================================
 * Dados de referência (não são segredo — apenas IDs internos ↔ nomes), usados
 * por `dashboard-api.ts` para:
 *   1) montar as chamadas reais à API (departamento padrão e ranking por
 *      atendente, um pedido por `userId`);
 *   2) traduzir `userId`/`departmentId` em nomes legíveis, caso a resposta
 *      da API venha só com IDs.
 *
 * Os IDs abaixo são os reais, confirmados (departamento "Fila Suporte -
 * Digisac" e os atendentes com seus `userId`).
 * ============================================================================
 */

export interface DigisacDepartment {
  id: string;
  name: string;
}

export interface DigisacAgent {
  id: string;
  name: string;
}

export const DEPARTMENTS: DigisacDepartment[] = [
  { id: "aa80cf14-8976-41e9-a597-538399159751", name: "Fila Suporte - Digisac" },
  { id: "67c13b3e-f547-4f24-b4cf-8544a79ef2b2", name: "Robô" },
  { id: "c320f011-4e94-4b8f-8e2f-7489d8dcc0d2", name: "Fila Atendimento" },
  // 🆕 (ALTERAÇÃO DESTA REVISÃO) Novos departamentos adicionados a pedido.
  { id: "75af2a23-60a2-4c9c-a6cd-e5e44259e8da", name: "Cluster" },
  { id: "db29fcee-6acd-41a1-8f1a-b7dd1316041c", name: "Sem avaliação" },
  { id: "59b1b9b1-bf14-4c3b-bcc8-cded50e8bc46", name: "Banimento" },
];

/**
 * Departamento usado por padrão no dashboard geral (confirmado pela
 * requisição real): "Fila Suporte - Digisac" — ou seja, por padrão o
 * dashboard mostra só atendimento humano, excluindo o departamento "Robô".
 * Se quiser trocar isso (ex.: um seletor de departamento na UI), passe
 * `departmentId` explicitamente em `DashboardFilters`.
 */
export const DEFAULT_DEPARTMENT_ID = DEPARTMENTS[0].id; // "Fila Suporte - Digisac"

/**
 * Departamentos consultados por padrão. Os totais do dashboard são a SOMA
 * de todos estes (o dashboard-api faz uma chamada por departamento e junta
 * os resultados — ver `fetchTotals`/`mergeTotals`).
 * Para consultar um departamento específico, passe `departmentId` em
 * `DashboardFilters` (aí só ele é usado).
 */
export const DEFAULT_DEPARTMENT_IDS: string[] = [
  "aa80cf14-8976-41e9-a597-538399159751", // Fila Suporte - Digisac
  "67c13b3e-f547-4f24-b4cf-8544a79ef2b2", // Robô
  "c320f011-4e94-4b8f-8e2f-7489d8dcc0d2", // Fila Atendimento
  "75af2a23-60a2-4c9c-a6cd-e5e44259e8da", // Cluster
  "db29fcee-6acd-41a1-8f1a-b7dd1316041c", // Sem avaliação
  "59b1b9b1-bf14-4c3b-bcc8-cded50e8bc46", // Banimento
];

/**
 * Lista real de atendentes (nome + userId) usada por `fetchAgentsRanking`
 * em `dashboard-api.ts` para montar o ranking — uma chamada por atendente,
 * filtrando `/dashboard/general` por `userId`.
 *
 * 🆕 (ALTERAÇÃO DESTA REVISÃO) "Agatha Otaviano" foi REMOVIDA desta lista
 * a pedido — ela não deve mais aparecer no ranking, no gráfico de
 * produtividade nem em nenhum seletor de atendente do dashboard.
 */
export const AGENTS: DigisacAgent[] = [
  { id: "296e0d4c-a546-4746-b6da-5afd9a62f2d4", name: "Manu Oliveira" },
  { id: "ea9ff42a-0ac8-4c1b-8685-08d12296a339", name: "Leidiane Magalhães" },
  { id: "e5920e00-5fb8-4b5d-8cce-1c17b12c52f9", name: "Ana Lins" },
  { id: "0778ff09-926d-4c23-9ba4-7540c5a85e51", name: "Bruno Lima" },
  { id: "f0e4bd59-b8e4-4c41-a543-cfe6ad7f8cfe", name: "Nicolas Limão" },
  { id: "5635d5d8-0523-48c8-812d-4898ec6d87ad", name: "Caue Santos" },
  { id: "0e0dd11e-410a-49f5-8e7b-16a0869e48f0", name: "Matheus Sousa" },
  { id: "93368a02-f011-46d6-80d1-6526a4a03c24", name: "Pedro Borim" },
  { id: "b857dbaf-e950-4465-a16d-bc9b87fbcffa", name: "Marco Teodoro" },
  { id: "2e7d7458-a5e5-4160-8cbf-854e440b603a", name: "Fabiano Soares" },
  { id: "f92bb80c-0fe9-4283-ac4b-cfb8eb9208d8", name: "Eduardo Martins" },
  { id: "447992bc-8464-47a0-a74f-d4a90313b3c8", name: "Luiz Florindo" },
  { id: "d894bdad-b0a0-4ed1-9ef2-b8f2c400b7cf", name: "Henry Porfirio" },
];

/** Busca rápida de nome do atendente a partir do userId (com fallback). */
export function getAgentName(userId: string | undefined | null): string {
  if (!userId) return "Desconhecido";
  return AGENTS.find((a) => a.id === userId)?.name ?? userId;
}

/** Busca rápida de nome do departamento a partir do departmentId (com fallback). */
export function getDepartmentName(departmentId: string | undefined | null): string {
  if (!departmentId) return "Desconhecido";
  return DEPARTMENTS.find((d) => d.id === departmentId)?.name ?? departmentId;
}
