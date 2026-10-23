import { envoyerParGmail, smtpDisponible } from "@/server/auth/gmail-smtp";

// Route de diagnostic éphémère, exclusivement destinée à l'expéditeur du lycée.
// Sera supprimée dès que le transport est testé en production.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (Date.now() > Date.UTC(2026, 9, 24, 9, 0, 0)) {
    return new Response(null, { status: 404 });
  }
  if (!smtpDisponible()) {
    return Response.json({ smtp: "configuration_incomplete" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const accepte = await envoyerParGmail("guergnerenaissance@gmail.com", "", true);
  return Response.json(
    { smtp: accepte ? "accepted_by_google" : "not_accepted" },
    { status: accepte ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
