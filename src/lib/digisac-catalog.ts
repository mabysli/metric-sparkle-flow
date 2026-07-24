/**
 * digisac-catalog.ts
 * ============================================================================
 * 🆕 ARQUIVO NOVO — criado durante a integração da API real.
 *
 * `dashboard-api.ts` (branch HEAD) já importava `AGENTS` e
 * `DEFAULT_DEPARTMENT_ID` daqui, mas o arquivo nunca tinha sido criado —
 * por isso o projeto não compilava. Os IDs abaixo são os reais, confirmados
 * por você (departamento "Fila Suporte - Digisac" e os 14 atendentes com
 * seus `userId`).
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

/**
 * Departamentos conhecidos da conta. `filaSuporte` é o departamento usado
 * na requisição real que você mandou; `robo` foi incluído também (aparece
 * na sua lista), caso um dia seja preciso filtrar ou combinar os dois.
 */
export const DEPARTMENTS: Record<"filaSuporte" | "robo", DigisacDepartment> = {
  filaSuporte: { id: "aa80cf14-8976-41e9-a597-538399159751", name: "Fila Suporte - Digisac" },
  robo: { id: "67c13b3e-f547-4f24-b4cf-8544a79ef2b2", name: "Robô" },
};

/** Departamento usado por padrão nas chamadas do dashboard (pode ser sobrescrito via `filters.departmentId`). */
export const DEFAULT_DEPARTMENT_ID = DEPARTMENTS.filaSuporte.id;

/**
 * Lista real de atendentes (nome + userId) usada por `fetchAgentsRanking`
 * em `dashboard-api.ts` para montar o ranking — uma chamada por atendente,
 * filtrando `/dashboard/general` por `userId`.
 */
export const AGENTS: DigisacAgent[] = [
  { id: "296e0d4c-a546-4746-b6da-5afd9a62f2d4", name: "Manu Oliveira" },
  { id: "2fd4d5da-6106-474e-a4ea-b97a66ad2b3c", name: "Laura Lopes - arq" },
  { id: "ea9ff42a-0ac8-4c1b-8685-08d12296a339", name: "Leidiane Magalhães" },
  { id: "e5920e00-5fb8-4b5d-8cce-1c17b12c52f9", name: "Ana Lins" },
  { id: "0778ff09-926d-4c23-9ba4-7540c5a85e51", name: "Bruno Lima" },
  { id: "f0e4bd59-b8e4-4c41-a543-cfe6ad7f8cfe", name: "Nicolas Limão" },
  { id: "5635d5d8-0523-48c8-812d-4898ec6d87ad", name: "Caue Santos" },
  { id: "06210cfe-ee27-4646-8f32-353cd720c6b5", name: "Bianca Miyazaki" },
  { id: "0e0dd11e-410a-49f5-8e7b-16a0869e48f0", name: "Matheus Sousa" },
  { id: "93368a02-f011-46d6-80d1-6526a4a03c24", name: "Pedro Borim" },
  { id: "b857dbaf-e950-4465-a16d-bc9b87fbcffa", name: "Marco Teodoro" },
  { id: "2e7d7458-a5e5-4160-8cbf-854e440b603a", name: "Fabiano Soares" },
  { id: "f92bb80c-0fe9-4283-ac4b-cfb8eb9208d8", name: "Eduardo Martins" },
  { id: "447992bc-8464-47a0-a74f-d4a90313b3c8", name: "Luiz Florindo" },
];