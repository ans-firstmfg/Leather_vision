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
