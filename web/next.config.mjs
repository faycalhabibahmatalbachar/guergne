import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Le dossier parent contient d'autres projets et un package-lock.json isolé ;
  // sans cette ligne, Turbopack remonte trop haut et prend une racine erronée.
  turbopack: { root: racine },

  reactCompiler: true,

  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      // On conserve error et warn : ce sont les seules traces exploitables
      // en production quand la base ou la passerelle SMS tombe.
      ? { exclude: ["error", "warn"] }
      : false,
  },

  // Le pilote Neon (WebSocket) doit rester en dépendance Node native et ne pas
  // être empaqueté par le bundler.
  serverExternalPackages: ["@neondatabase/serverless", "ws", "@node-rs/argon2"],

  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
