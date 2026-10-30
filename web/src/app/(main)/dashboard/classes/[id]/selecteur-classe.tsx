"use client";

import { useRouter } from "next/navigation";

import { ChevronDown } from "lucide-react";

export function SelecteurClasse({
  anneeId,
  active,
  classes,
}: {
  anneeId: string;
  active: string;
  classes: Array<{ id: string; libelle: string }>;
}) {
  const router = useRouter();
  return (
    <label className="relative inline-flex h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm">
      <span className="shrink-0 text-muted-foreground">Classe</span>
      <select
        aria-label="Changer de classe"
        value={active}
        onChange={(event) => router.push(`/dashboard/classes/${event.target.value}?annee=${anneeId}`)}
        className="min-w-0 max-w-40 cursor-pointer appearance-none bg-transparent pr-5 text-xs font-semibold outline-none"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.libelle}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" aria-hidden />
    </label>
  );
}
