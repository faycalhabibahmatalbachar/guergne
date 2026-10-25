import type { Metadata } from "next";
import Image from "next/image";
import { APP_CONFIG } from "@/config/app-config";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { chargerIdentiteLycee } from "@/server/domain/identite-lycee";
import { exigerPage } from "@/server/guard";

import { FormulaireIdentite } from "./formulaire";

export const metadata: Metadata = { title: "Identité du lycée — Paramètres" };
export const dynamic = "force-dynamic";

export default async function PageIdentiteLycee() {
  await exigerPage("parametre:modifier");
  const identite = await chargerIdentiteLycee();

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Identité du lycée</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Coordonnées officielles et signataires de l'établissement unique.
        </p>
      </div>

      {!identite ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            La fiche institutionnelle est absente de la base de données. Aucune
            création implicite n'a été effectuée. Vérifiez les migrations initiales.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex items-start gap-4 rounded-xl border bg-card p-5" aria-label="Identité institutionnelle">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-white p-1">
              <Image src={APP_CONFIG.logoUrl} alt="Blason officiel du lycée" width={48} height={48} className="size-12 object-contain" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold">{identite.nom}</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                Sigle : {identite.sigle} · Devise : {identite.devise}
              </p>
              <p className="mt-2 text-muted-foreground text-xs">
                Le nom, le sigle et la devise restent fixes dans cet écran pour éviter
                des divergences entre la navigation, les reçus et les documents officiels.
              </p>
            </div>
          </section>

          <FormulaireIdentite key={identite.version} initial={identite} />
          <p className="flex items-start gap-2 text-muted-foreground text-xs">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Ces informations proviennent de la fiche unique en base et sont
            réutilisées par le générateur de bulletins. Le blason officiel est
            partagé par les écrans et les documents ; cachet et signature
            numérique conservent leurs circuits sécurisés.
          </p>
        </>
      )}
    </main>
  );
}
