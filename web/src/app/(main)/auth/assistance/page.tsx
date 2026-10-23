import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { ArrowLeft } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";

import { DemandeReinitialisation } from "../_components/demande-reinitialisation";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function PageAssistanceConnexion() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-5 py-12 text-neutral-950">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center gap-4">
          <Image src="/logo-officiel.webp" alt="Logo officiel du lycée" width={65} height={55} unoptimized />
          <div>
            <p className="font-semibold">{APP_CONFIG.nomComplet}</p>
            <p className="text-sm text-neutral-500">Espace d&apos;administration</p>
          </div>
        </div>
        <section className="space-y-7" aria-labelledby="titre-reinitialisation">
          <div className="space-y-2">
            <h1 id="titre-reinitialisation" className="text-3xl font-bold tracking-tight">Mot de passe oublié ?</h1>
            <p className="text-sm leading-relaxed text-neutral-500">
              Entrez l&apos;adresse e-mail associée à votre compte. Vous recevrez un lien valable 20 minutes pour choisir un nouveau mot de passe.
            </p>
          </div>
          <DemandeReinitialisation />
        </section>
        <Link href="/auth/connexion" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Retour à la connexion
        </Link>
      </div>
    </main>
  );
}
