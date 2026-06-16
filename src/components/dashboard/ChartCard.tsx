/**
 * ChartCard.tsx
 * ----------------------------------------------------------------------------
 * "Casca" reutilizável usada para envolver gráficos e tabelas com o mesmo
 * estilo visual (borda, padding, sombra, título e subtítulo).
 *
 * Ao centralizar este layout em um único componente, todos os blocos do
 * dashboard ficam visualmente consistentes — e se quisermos mudar o
 * estilo do "cartão", basta alterar aqui.
 * ----------------------------------------------------------------------------
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;          // título principal exibido no topo do card
  subtitle?: string;      // descrição opcional logo abaixo do título
  action?: ReactNode;     // elemento opcional à direita (badge, botão, etc.)
  children: ReactNode;    // conteúdo do card — normalmente um gráfico ou tabela
  className?: string;     // classes extras para ajustes pontuais de layout
}

export function ChartCard({ title, subtitle, action, children, className }: ChartCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]", className)}>
      {/* Cabeçalho do card: título + subtítulo à esquerda, ação opcional à direita */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Conteúdo principal — quem usa o ChartCard injeta aqui o gráfico/tabela */}
      {children}
    </div>
  );
}
