/**
 * format-duration.ts
 * ============================================================================
 * 🆕 (ALTERAÇÃO DESTA REVISÃO) Helper único para exibir DURAÇÕES.
 *
 * A API da Digisac devolve tempos em SEGUNDOS (`waitingTime`,
 * `waitingTimeAvg`, `waitingTimeAfterBot`, `ticketTime`...). Antes o
 * dashboard convertia tudo para minutos e perdia a precisão dos segundos.
 * Agora guardamos SEMPRE em segundos e formatamos aqui, no padrão da
 * imagem enviada: "7h 6m", "10m 1s", "45s".
 * ============================================================================
 */

/** Converte segundos em um rótulo legível: "7h 6m 12s" / "10m 1s" / "45s". */
export function formatDuration(totalSeconds: number | undefined | null): string {
  const s = Math.max(0, Math.round(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  // Sempre mostramos os segundos quando não há horas — foi o pedido:
  // "coloque segundos no retorno das variáveis".
  if (sec || parts.length === 0) parts.push(`${sec}s`);
  return parts.join(" ");
}