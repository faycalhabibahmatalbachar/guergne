import type { Metadata } from "next";

import { listerEnseignants } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { ListeEnseignants } from "./_components/liste-enseignants";

export const metadata: Metadata = { title: "Personnel" };
export const dynamic = "force-dynamic";

export default async function PagePersonnel() {
  await exigerPage("utilisateur:creer");

  const annee = await chargerAnneeCourante();
  const enseignants = await listerEnseignants(annee?.id ?? null);

  return <ListeEnseignants enseignants={enseignants} />;
}
