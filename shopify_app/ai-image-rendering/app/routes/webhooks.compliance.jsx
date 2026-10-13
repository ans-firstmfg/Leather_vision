import { authenticate } from "../shopify.server";
import db from "../db.server";
import { removeGenerations } from "../services/generate.server";

// Mandatory privacy webhooks. authenticate.webhook rejects invalid HMACs with 401.
export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  switch (String(topic).toUpperCase().replaceAll("/", "_")) {
    case "CUSTOMERS_DATA_REQUEST": {
      const customerId = payload.customer?.id == null ? null : String(payload.customer.id);
      const designs = customerId ? await db.generation.count({ where: { shop, customerId } }) : 0;
      console.info("Leather Vision customer data request", { shop, designs });
      break;
    }
    case "CUSTOMERS_REDACT":
      if (payload.customer?.id != null) {
        await removeGenerations({ shop, customerId: String(payload.customer.id) });
      }
      break;
    case "SHOP_REDACT":
      await removeGenerations({ shop });
      await db.session.deleteMany({ where: { shop } });
      break;
    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }
  return new Response();
};
