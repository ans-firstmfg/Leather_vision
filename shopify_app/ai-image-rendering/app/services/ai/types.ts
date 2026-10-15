export type ImageEditRequest = {
  imagePng?: Buffer;
  prompt: string;
  variationIndex?: number;
  signal?: AbortSignal;
};

export type ImageEditResult = {
  bytes: Buffer;
};

export type ImageEditProvider = {
  id: "openai" | "mock" | "cloudflare";
  editImage: (request: ImageEditRequest) => Promise<ImageEditResult>;
};
