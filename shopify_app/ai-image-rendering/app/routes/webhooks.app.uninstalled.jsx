import { authenticate } from "../shopify.server";
import db from "../db.server";
import { cancelQueuedJobs } from "../services/jobs.server";

// Designs stay available for orders until retention expiry or Shopify's shop/redact
// webhook (sent 48 hours after uninstall), so an accidental uninstall loses nothing.
export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);
  await db.session.deleteMany({ where: { shop } });
  await cancelQueuedJobs(shop);
  return new Response();
};
