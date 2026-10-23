"use client";

import { useState, type ComponentProps } from "react";

import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Proprietes = Omit<ComponentProps<typeof Input>, "type">;

export function ChampMotDePasse({
  className,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: Proprietes) {
  const [visible, setVisible] = useState(false);
  const [verrMaj, setVerrMaj] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          className={cn("h-11 pr-12", className)}
          onKeyDown={(event) => {
            setVerrMaj(event.getModifierState("CapsLock"));
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            setVerrMaj(event.getModifierState("CapsLock"));
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setVerrMaj(false);
            onBlur?.(event);
          }}
        />
        <button
          type="button"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          onClick={() => setVisible((valeur) => !valeur)}
          className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {verrMaj ? (
        <p role="status" className="text-amber-700 text-xs dark:text-amber-400">
          Verr. maj. est activée.
        </p>
      ) : null}
    </div>
  );
}
