import Link from "next/link";

import { journalFilterSchema, readJournal, readOutbox } from "@/server/domain/communication-v2";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { JournalV2 } from "./_components/journal-v2";
import { WorkspaceV2 } from "./_components/workspace-v2";
import "../default/gentelella-tokens.css";
import "../default/gentelella-components.css";
import "../default/gentelella-widgets.css";
import "./communication-v2.css";

export async function CommunicationPageV2({ params }: { params: Record<string, string | undefined> }) {
  const actor = await exigerPage("annonce:publier");
  const year = await chargerAnneeCourante();
  if (!year) return <p>Configurez une année scolaire avant de préparer une communication.</p>;
  const filter = journalFilterSchema.parse(params);
  const [journal, outbox, { classes }] = await Promise.all([
    readJournal(filter),
    readOutbox(),
    listerClassesEtMatieres(year.id),
  ]);
  const total = outbox.counts.reduce((sum, row) => sum + Number(row.n), 0);
  const pageLink = (page: number) =>
    `/dashboard/communication?${new URLSearchParams({ ...filter, page: String(page) })}`;
  return (
    <div className="gentelella-v4 communication-v2">
      <header>
        <h1>Communication</h1>
        <p>Année {year.libelle} · préparation et suivi des échanges avec les familles</p>
      </header>
      <p className="communication-warning">
        Recette V2. Les simulations sont distinguées des expéditions réelles. Les échecs historiques sont conservés.
        Toute activation en production nécessite une validation distincte.
      </p>
      <div className="communication-kpis">
        {[
          { label: "Notifications V2", value: total },
          { label: "Retard supérieur à 15 min", value: outbox.health?.stale ?? 0 },
          { label: "Traitements interrompus", value: outbox.health?.expired_leases ?? 0 },
        ].map((k) => (
          <section key={k.label} className="card">
            <div className="card-body">
              <h2>{k.label}</h2>
              <strong>{k.value}</strong>
            </div>
          </section>
        ))}
      </div>
      <WorkspaceV2
        anneeId={year.id}
        draftKey={`communication:${actor.id}:${year.id}`}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
      />
      <section className="card" aria-labelledby="journal-title">
        <div className="card-header">
          <h2 id="journal-title" className="card-title">
            Journal d’expédition
          </h2>
          <p>{journal.total} résultat(s)</p>
        </div>
        <div className="card-body">
          <form className="communication-fields" method="get">
            <label>
              Rechercher un titre
              <input name="query" defaultValue={filter.query} maxLength={100} />
            </label>
            <label>
              Canal
              <select name="channel" defaultValue={filter.channel}>
                <option value="ALL">Tous les canaux</option>
                <option value="SMS">SMS</option>
                <option value="PUSH">Push</option>
                <option value="IN_APP">Dans l’application</option>
                <option value="EMAIL">Courriel</option>
              </select>
            </label>
            <label>
              État historique
              <select name="status" defaultValue={filter.status}>
                <option value="ALL">Tous les états</option>
                <option value="EN_ATTENTE">En attente</option>
                <option value="ENVOYE">Envoyées</option>
                <option value="ECHOUE">Échecs</option>
                <option value="LU">Lues</option>
              </select>
            </label>
            <button type="submit" className="btn btn-outline">
              Filtrer
            </button>
          </form>
        </div>
        <JournalV2 rows={journal.rows} />
        <nav className="card-footer communication-actions" aria-label="Pagination du journal">
          {filter.page > 1 ? (
            <Link className="btn btn-outline" href={pageLink(filter.page - 1)}>
              Précédente
            </Link>
          ) : null}
          <span>Page {filter.page} · 25 lignes par page</span>
          {filter.page * 25 < journal.total ? (
            <Link className="btn btn-outline" href={pageLink(filter.page + 1)}>
              Suivante
            </Link>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
