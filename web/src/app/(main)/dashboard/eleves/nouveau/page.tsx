import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerPage } from "@/server/guard";

export const metadata: Metadata = { title: "Inscrire un élève" };

/** L'URL historique conserve son utilité, mais l'inscription est désormais
 * une fenêtre dans le module Élèves, non une deuxième page.
 */
export default async function PageInscription() {
  await exigerPage("eleve:inscrire");
  redirect("/dashboard/eleves?inscription=1");
}
