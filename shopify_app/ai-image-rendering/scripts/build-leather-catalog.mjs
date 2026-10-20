import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("catalog/leathers.json", root), "utf8"));
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const translation = (key) => `{{ 'leather_vision.${key}' | t }}`;
const localePath = new URL("extensions/leather-vision/locales/en.default.json", root);
const locale = JSON.parse(await readFile(localePath, "utf8"));
// These fields belonged to form controls and headings removed from the storefront.
for (const key of ["options", "product_type_label", "extra_options", "stitching_label",
  "hardware_label", "variations_label", "upload_hint", "stitching_placeholder",
  "hardware_placeholder", "product_unavailable", "studio_label", "form_title",
  "form_hint", "form_footer", "output_label", "output_footer", "preview_title", "preview_caption"]) {
  delete locale.leather_vision[key];
}
locale.leather_vision.catalog_group = "Leather group";
locale.leather_vision.catalog_all = "All leathers";
locale.leather_vision.catalog_groups = Object.fromEntries(catalogue.groups.map((group, index) => ["group-" + index, group]));
locale.leather_vision.flow_categories = Object.fromEntries(catalogue.articles.map((article) => [article.slug, article.name]));
await writeFile(localePath, JSON.stringify(locale) + "\n");
const options = catalogue.groups.map((group, index) => `    <option value="${escape(group)}">${translation("catalog_groups.group-" + index)}</option>`).join("\n");
const cards = catalogue.articles.map(({ slug, groups }) => {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid catalogue slug");
  const key = "flow_categories." + slug;
  return `<label class="lv__choice" data-leather-groups="${escape(groups.join("|"))}">
  <input type="radio" name="leather" value="${slug}" required data-lv-field>
  <span class="lv__choice-tile"><img src="{{ 'lv-catalog-${slug}.jpg' | asset_url }}" alt="" width="240" height="240" loading="lazy"><span class="lv__choice-label">${translation(key)}</span><span class="lv__choice-check" aria-hidden="true">✓</span></span>
</label>`;
}).join("\n");
const snippet = `{% doc %}
  Leather article picker generated from catalog/leathers.json.
  Rebuild with node scripts/build-leather-catalog.mjs.
  @param {string} block_id - The app block instance identifier.
{% enddoc %}
<div class="lv__field">
  <label class="lv__label" for="lv-leather-group-{{ block_id }}">${translation("catalog_group")}</label>
  <select id="lv-leather-group-{{ block_id }}" class="lv__input" data-leather-group>
    <option value="">${translation("catalog_all")}</option>
${options}
  </select>
</div>
<fieldset class="lv__choices lv__choices--catalog" aria-labelledby="lv-flow-title-1-{{ block_id }}">
${cards}
</fieldset>
`;
await mkdir(new URL("extensions/leather-vision/snippets/", root), { recursive: true });
await writeFile(new URL("extensions/leather-vision/snippets/leather-catalog.liquid", root), snippet);
console.log(`Built ${catalogue.articles.length} leather choices across ${catalogue.groups.length} groups.`);
