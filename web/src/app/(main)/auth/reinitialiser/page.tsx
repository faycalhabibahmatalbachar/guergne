import Link from "next/link";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { compteDuJeton } from "@/server/auth/reinitialisation";

import { ConfirmationReinitialisation } from "../_components/confirmation-reinitialisation";
import { HabillageAuthentification } from "../_components/habillage-authentification";
import styles from "../connexion/connexion.module.css";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PageReinitialiser({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  const valide = Boolean(jeton && (await compteDuJeton(jeton)));

  return (
    <HabillageAuthentification regionLabel="Définir un nouveau mot de passe">
      <div className={styles.form}>
        {valide && jeton ? (
          <>
            <header className={styles.formHeading}>
              <h1>Nouveau mot de passe</h1>
              <p>
                Choisissez un nouveau mot de passe pour sécuriser votre compte. Toutes vos sessions existantes seront
                fermées.
              </p>
            </header>
            <ConfirmationReinitialisation jeton={jeton} />
          </>
        ) : (
          <>
            <header className={styles.formHeading}>
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-alerte-doux text-alerte">
                <ShieldAlert className="size-5" aria-hidden />
              </div>
              <h1>Lien expiré ou invalide</h1>
              <p>
                Ce lien n&apos;est plus utilisable. Pour protéger votre compte, demandez un nouveau lien de
                réinitialisation.
              </p>
            </header>
            <Link href="/auth/assistance" className={styles.backLink}>
              Demander un nouveau lien
            </Link>
          </>
        )}
        <nav className={styles.recoveryFooter} aria-label="Navigation d'authentification">
          <Link href="/auth/connexion" className={styles.backLink}>
            <ArrowLeft className="size-4" aria-hidden />
            <span>Retour à la connexion</span>
          </Link>
        </nav>
      </div>
    </HabillageAuthentification>
  );
}
