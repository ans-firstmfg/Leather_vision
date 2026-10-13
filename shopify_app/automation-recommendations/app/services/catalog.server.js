import query from "./catalog.graphql?raw";
import { scanCatalogQuery } from "./catalog.mjs";
export const scanCatalog = (admin) => scanCatalogQuery(admin, query);
