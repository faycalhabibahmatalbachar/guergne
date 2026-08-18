import packageJson from "../../package.json";

const anneeCourante = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Lycée La Renaissance",
  nomComplet: "Lycée Guergné La Renaissance",
  sigle: "LGR",
  version: packageJson.version,
  copyright: `© ${anneeCourante}, Lycée Guergné La Renaissance.`,
  devise: "FCFA",
  meta: {
    title: "Lycée Guergné La Renaissance — Administration",
    description:
      "Plateforme d'administration scolaire du Lycée Guergné La Renaissance : élèves, notes, bulletins, assiduité, discipline et scolarité, de la 6ème à la Terminale.",
  },
};
