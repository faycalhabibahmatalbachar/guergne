import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { sessionCourante } from "@/server/auth/session";

import { FormulaireConnexion } from "../_components/formulaire-connexion";
import { HabillageAuthentification } from "../_components/habillage-authentification";
import styles from "./connexion.module.css";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Accès à l'administration du Lycée Guergné La Renaissance.",
};

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const principal = await sessionCourante();
  if (principal) redirect(principal.doitChangerMdp ? "/auth/mot-de-passe" : "/dashboard/default");

  const { change } = await searchParams;
  return (
    <HabillageAuthentification regionLabel="Formulaire de connexion">
      {change ? (
        <p role="status" className={styles.changeNotice}>
          Mot de passe modifié. Reconnectez-vous avec le nouveau.
        </p>
      ) : null}
      <FormulaireConnexion />
    </HabillageAuthentification>
  );
}
