import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { APP_CONFIG } from "@/config/app-config";
import { compteDuJeton } from "@/server/auth/reinitialisation";

import { ConfirmationReinitialisation } from "../_components/confirmation-reinitialisation";

export const metadata: Metadata = {
  title: "Réinitialiser le mot de passe",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageReinitialiser({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const { jeton } = await searchParams;
  if (!jeton || !(await compteDuJeton(jeton))) {
    return (
      <main className="grid min-h-svh place-items-center bg-white px-5 text-neutral-950">
        <div className="w-full max-w-md space-y-5">
          <h1 className="text-2xl font-bold">Lien de réinitialisation invalide ou expiré</h1>
          <p className="text-sm text-neutral-500">
            Pour protéger votre compte, les liens expirent après 20 minutes et ne peuvent pas être réutilisés après un changement de mot de passe.
          </p>
          <Link href="/auth/assistance" className="font-medium underline">Demander un nouveau lien</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="grid min-h-svh place-items-center bg-white px-5 py-12 text-neutral-950">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center gap-3">
          <Image src="/logo-officiel.webp" width={65} height={55} alt="Logo officiel du lycée" unoptimized />
          <span className="font-semibold">{APP_CONFIG.nomComplet}</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Nouveau mot de passe</h1>
          <p className="text-sm text-neutral-500">Définissez votre nouveau mot de passe. Toutes les sessions ouvertes seront fermées.</p>
        </div>
        <ConfirmationReinitialisation jeton={jeton} />
        <Link className="text-sm font-medium underline" href="/auth/connexion">Retour à la connexion</Link>
      </div>
    </main>
  );
}
