/**
 * ThemeToggle.tsx
 * ----------------------------------------------------------------------------
 * 🆕 (ALTERAÇÃO) Botão compacto para alternar entre MODO CLARO e MODO ESCURO.
 *
 * Como funciona (explicação para iniciantes):
 *  - O tema escuro é ativado adicionando a classe CSS "dark" no elemento <html>.
 *  - Todas as cores do dashboard são "variáveis de tema" (ver src/styles.css),
 *    então basta essa classe para TODO o sistema mudar: fundo, cards, tabelas,
 *    gráficos, textos, bordas, ícones, filtros, menus e tooltips.
 *  - A escolha é salva no localStorage (chave "theme"), então ao atualizar ou
 *    reabrir a página o tema escolhido é mantido.
 * ----------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/** Aplica a classe no <html> e persiste a preferência. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ambiente sem localStorage — apenas ignora */
  }
}

export function ThemeToggle() {
  // Começamos em "light" e corrigimos após a hidratação, evitando divergência
  // entre o HTML gerado no servidor e o renderizado no navegador.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo escuro ativo — clique para o modo claro" : "Modo claro ativo — clique para o modo escuro"}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 text-xs font-medium shadow-sm"
    >
      {/* Duas "pastilhas": a ativa fica destacada, deixando claro o modo atual. */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
          !isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <Sun className="h-3.5 w-3.5" />
        Claro
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
          isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <Moon className="h-3.5 w-3.5" />
        Escuro
      </span>
    </button>
  );
}
