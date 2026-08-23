"use client";

import { FileText, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Édition des documents officiels d'un élève.
 *
 * Les liens ouvrent le PDF dans un nouvel onglet plutôt que de le télécharger :
 * au guichet, l'agent imprime immédiatement. Le téléchargement reste possible
 * depuis le lecteur, ou via le second lien.
 */
export interface BulletinDisponible {
  inscriptionId: string;
  periodeId: string;
  periodeLibelle: string;
  publie: boolean;
}

export function DocumentsEleve({
  eleveId,
  estParti,
  bulletins = [],
}: {
  eleveId: string;
  estParti: boolean;
  /** Périodes pour lesquelles un bulletin existe. Vide tant qu'aucun conseil n'a eu lieu. */
  bulletins?: BulletinDisponible[];
}) {
  const lien = (type: string, telecharger = false) =>
    `/api/documents/${type}/${eleveId}${telecharger ? "?telecharger" : ""}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer aria-hidden />
          Documents
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Éditer un document</DropdownMenuLabel>

        <DropdownMenuItem asChild>
          <a href={lien("certificat-scolarite")} target="_blank" rel="noopener noreferrer">
            <FileText aria-hidden />
            Certificat de scolarité
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <a href={lien("fiche-inscription")} target="_blank" rel="noopener noreferrer">
            <FileText aria-hidden />
            Fiche d&apos;inscription
          </a>
        </DropdownMenuItem>

        {bulletins.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Bulletins</DropdownMenuLabel>
            {bulletins.map((b) => (
              <DropdownMenuItem key={b.periodeId} asChild>
                <a
                  href={`/api/bulletins/${b.inscriptionId}/${b.periodeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText aria-hidden />
                  {b.periodeLibelle}
                  {/*
                    Un bulletin non publié reste imprimable par l'administration
                    — le conseil de classe travaille dessus avant de le rendre
                    visible aux familles — mais il doit être signalé comme tel.
                  */}
                  {b.publie ? null : (
                    <span className="text-muted-foreground ml-auto text-xs">brouillon</span>
                  )}
                </a>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        {estParti ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={lien("certificat-transfert")} target="_blank" rel="noopener noreferrer">
                <FileText aria-hidden />
                Certificat de transfert
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
