import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { exigerSession } from "@/server/guard";

import { FormulaireMotDePasse } from "../_components/formulaire-mot-de-passe";
import { HabillageAuthentification } from "../_components/habillage-authentification";
import styles from "../connexion/connexion.module.css";

export const metadata: Metadata = { title: "Changer le mot de passe" };

export default async function PageMotDePasse() {
  const principal = await exigerSession();
  if (principal.role === "PARENT" || principal.role === "ELEVE") redirect("/unauthorized");

  return (
    <HabillageAuthentification regionLabel="Modifier le mot de passe">
      <div className={styles.form}>
        <header className={styles.formHeading}>
          <h1>{principal.doitChangerMdp ? "Définir votre mot de passe" : "Changer votre mot de passe"}</h1>
          <p>
            {principal.doitChangerMdp
              ? "Pour accéder à l’administration, remplacez votre mot de passe provisoire."
              : "Renforcez la sécurité de votre compte avec un nouveau mot de passe."}
          </p>
        </header>
        <FormulaireMotDePasse />
        <nav className={styles.recoveryFooter} aria-label="Navigation d'authentification">
          <Link href="/dashboard/default" className={styles.backLink}>
            <ArrowLeft className="size-4" aria-hidden />
            <span>Retour au tableau de bord</span>
          </Link>
        </nav>
      </div>
    </HabillageAuthentification>
  );
}
