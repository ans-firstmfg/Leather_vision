import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export async function action({ request }) {
  const { topic, shop } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") await prisma.session.deleteMany({ where: { shop } });
  // No customer/order data or scan results are retained by this app.
  return new Response();
}
