import RecommendationDashboard from "../components/RecommendationDashboard";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { scanCatalog } from "../services/catalog.server";
import { recommend } from "../services/recommendations.mjs";
import { demoProducts } from "../services/demo.mjs";

export async function loader({ request }) {
  await authenticate.admin(request);
  return null;
}
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") === "demo") {
    return { items: recommend(demoProducts), productCount: demoProducts.length, demo: true };
  }
  if (form.get("intent") !== "scan") return Response.json({ error: "Choose Scan products or Try sample demo." }, { status: 400 });
  try { return await scanCatalog(admin); }
  catch {
    return Response.json({ error: "The scan could not finish. Check app permissions and try again. No product changes were made." }, { status: 502 });
  }
}
export default function Recommendations() {
  const fetcher = useFetcher();
  return <RecommendationDashboard result={fetcher.data} busy={fetcher.state !== "idle"}
    run={(intent) => fetcher.submit({ intent }, { method: "post" })} />;
}