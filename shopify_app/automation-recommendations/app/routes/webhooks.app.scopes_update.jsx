import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export async function action({ request }) {
  const { payload, session } = await authenticate.webhook(request);
  if (session) await prisma.session.updateMany({ where: { id: session.id }, data: { scope: (payload.current ?? []).join(",") } });
  return new Response();
}
