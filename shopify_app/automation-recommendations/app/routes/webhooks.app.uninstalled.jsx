import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export async function action({ request }) {
  const { shop } = await authenticate.webhook(request);
  await prisma.session.deleteMany({ where: { shop } });
  return new Response();
}
