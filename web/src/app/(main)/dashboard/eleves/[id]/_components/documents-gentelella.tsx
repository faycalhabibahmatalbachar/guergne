import { Download, ExternalLink, FileBadge2, FileText } from "lucide-react";

import { statusBadge } from "@/vendor/gentelella-v4/markup.js";

type DocumentType = {
  type: string;
  nom: string;
  description: string;
};
export function DocumentsGentelella({ eleveId, estParti }: { eleveId: string; estParti: boolean }) {
  const docs: DocumentType[] = [
    {
      type: "certificat-scolarite",
      nom: "Certificat de scolarité",
      description: "Document officiel de l'établissement",
    },
    { type: "fiche-inscription", nom: "Fiche d'inscription", description: "Récapitulatif administratif" },
    ...(estParti
      ? [{ type: "certificat-transfert", nom: "Certificat de transfert", description: "Départ de l'établissement" }]
      : []),
  ];
  return (
    <section className="min-w-0" aria-label="Documents officiels disponibles">
      <div className="chart-header">
        <div className="chart-header-left">
          <h3 className="card-title">Documents officiels</h3>
          <p className="card-subtitle">Édition à la demande · format PDF</p>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table min-w-[610px]">
          <thead>
            <tr>
              <th>Document</th>
              <th>Format</th>
              <th>État</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const url = "/api/documents/" + d.type + "/" + eleveId;
              return (
                <tr key={d.type}>
                  <td>
                    <div className="flex items-start gap-2.5">
                      <FileText className="mt-1 size-4 shrink-0 text-succes" aria-hidden />
                      <div>
                        <div className="font-semibold">{d.nom}</div>
                        <div className="text-xs text-muted-foreground">{d.description}</div>
                      </div>
                    </div>
                  </td>
                  <td>PDF</td>
                  <td>
                    <span dangerouslySetInnerHTML={{ __html: statusBadge("À générer", "blue") }} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline inline-flex h-9 items-center gap-1.5 rounded-lg px-3"
                        aria-label={"Ouvrir " + d.nom}
                      >
                        <ExternalLink className="size-4" aria-hidden />
                        Ouvrir
                      </a>
                      <a
                        href={url + "?telecharger"}
                        className="btn btn-outline inline-flex h-9 items-center gap-1.5 rounded-lg px-3"
                        aria-label={"Télécharger " + d.nom}
                      >
                        <Download className="size-4" aria-hidden />
                        PDF
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="card-footer text-xs">
        La création du PDF exige l'autorisation d'émission et est tracée côté serveur.
      </p>
    </section>
  );
}
