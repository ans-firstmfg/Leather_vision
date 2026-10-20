import type { GenerationJob } from "./jobs.server";
import { leatherLabel, productTypeLabel } from "./materials.server";

const MAX_PROMPT = 2500;

function clause(label: string, value?: string): string | undefined {
  if (!value) return undefined;
  return `${label}: ${value}.`;
}

export function buildEditPrompt(
  options: GenerationJob["options"],
  variationIndex: number,
  hasMaterialReference = false,
): string {
  const product = productTypeLabel(options.productType) ?? "leather product";
  const leather = leatherLabel(options.leather);

  const parts = [
    options.hasReferenceImage === false
      ? `Create a photorealistic catalog photo of a ${product} from the following specifications.`
      : `Edit this reference into a photorealistic catalog photo of a ${product}.`,
    options.hasReferenceImage === false
      ? "Design a coherent, functional product with realistic construction and proportions."
      : "Preserve the exact silhouette, seams, pockets, proportions, and layout from the uploaded design. Do not invent new structure or change the composition.",
    leather ? `Material: ${leather}.` : "Material: fine leather with visible grain.",
    clause("Color", options.color),
    hasMaterialReference
      ? options.hasReferenceImage === false
        ? "Image 0 is a leather material swatch, not a product design. Create the requested product using this swatch's surface texture; do not reproduce the swatch as the output."
        : "Image 0 is the customer's product design; preserve its structure. Image 1 is a material swatch; use only its surface texture on the product, not its shape or background."
      : undefined,
    hasMaterialReference
      ? `The selected material and color are mandatory. Preserve the swatch's recognizable grain, scale pattern, embossing, print, pile and finish across the product. Recolor the material to ${options.color || "the specified color"} while retaining its surface details. Do not replace textured material with plain smooth leather. Customer notes describe the product construction.`
      : undefined,
    hasMaterialReference && /emboss/i.test(leather || "") && /python|snake/i.test(leather || "")
      ? "Make the python snakeskin embossing clearly visible: irregular scale shapes and raised scale edges with realistic texture shadows, including on white leather."
      : undefined,
    clause("Stitching", options.stitching),
    clause("Hardware", options.hardware),
    clause("Customer notes", options.instructions),
    "Studio lighting, sharp focus, natural leather texture, commercial product photography.",
    variationIndex > 0
      ? `Slight variation ${variationIndex + 1}: modest lighting or camera-angle change only; keep the same design.`
      : undefined,
  ].filter(Boolean);

  return parts.join(" ").slice(0, MAX_PROMPT);
}
