/**
 * KpiCard.tsx
 * ----------------------------------------------------------------------------
 * Componente reutilizável que exibe um "KPI" (Key Performance Indicator /
 * Indicador-chave de Desempenho). Cada card mostra:
 *   - um rótulo (ex.: "Total de Chamados")
 *   - um valor numérico grande (ex.: 1.234)
 *   - uma variação percentual comparada ao período anterior (delta)
 *   - um ícone que reforça visualmente o tema do indicador
 *
 * É um componente puramente visual ("burro"): ele NÃO busca dados na API.
 * Quem decide o que mostrar é o componente pai (em src/routes/index.tsx),
 * que passa os valores prontos via props.
 * ----------------------------------------------------------------------------
 */

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils"; // utilitário que junta classes Tailwind condicionalmente

// Propriedades aceitas pelo componente. Em TypeScript usamos `interface`
// para descrever o "formato" dos dados que o componente espera receber.
interface KpiCardProps {
  label: string;          // texto curto descrevendo o indicador
  value: string | number; // o valor a ser exibido (já formatado se for string)
  delta: number;          // variação percentual vs. período anterior (ex.: 12.5 ou -3.2)
  icon: LucideIcon;       // ícone do pacote lucide-react
  tone?: "primary" | "success" | "warning" | "info"; // cor do ícone
  loading?: boolean;      // quando true, exibe um "esqueleto" no lugar do valor
}

// Mapeia cada "tom" para classes CSS. Centralizar aqui facilita manter
// a identidade visual coerente e permite trocar cores em um único lugar.
const TONE_BG: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-[color:var(--success)]/10 text-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
};

export function KpiCard({ label, value, delta, icon: Icon, tone = "primary", loading }: KpiCardProps) {
  // Se o delta for >= 0 consideramos uma variação positiva (verde/seta para cima).
  const positive = delta >= 0;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Rótulo do indicador (texto pequeno em caixa alta) */}
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>

          {/* Enquanto está carregando, exibimos um bloco animado (skeleton).
              Quando os dados chegam, mostramos o valor formatado. */}
          {loading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          )}
        </div>

        {/* Caixa colorida com o ícone do indicador */}
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", TONE_BG[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {/* Rodapé do card: badge com a variação percentual.
          Só exibimos quando não está carregando. */}
      {!loading && (
        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
              positive
                ? "bg-[color:var(--success)]/10 text-[color:var(--success)]"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs. período anterior</span>
        </div>
      )}
    </div>
  );
}
