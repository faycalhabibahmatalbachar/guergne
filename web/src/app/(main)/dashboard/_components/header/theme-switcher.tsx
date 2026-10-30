"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const THEME_CYCLE = ["light", "dark", "system"] as const;

const LIBELLES_MODE: Record<string, string> = {
  light: "clair",
  dark: "sombre",
  system: "suivant le système",
};

export function ThemeSwitcher() {
  const { themeMode, setPreference } = usePreferencesStore(
    useShallow((state) => ({
      themeMode: state.values.theme_mode,
      setPreference: state.setPreference,
    })),
  );

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];

    setPreference("theme_mode", nextTheme);
  };

  return (
    // Fantôme, comme les autres commandes de l'en-tête : en plein, ce bouton
    // devenait un aplat de couleur primaire isolé à côté de la recherche.
    <Button
      size="icon"
      variant="ghost"
      onClick={cycleTheme}
      aria-label={`Apparence : ${LIBELLES_MODE[themeMode] ?? themeMode}. Cliquer pour changer.`}
    >
      {/* SYSTEM */}
      <Monitor className="hidden [html[data-theme-mode=system]_&]:block" />

      {/* DARK (resolved) */}
      <Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />

      {/* LIGHT (resolved) */}
      <Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
