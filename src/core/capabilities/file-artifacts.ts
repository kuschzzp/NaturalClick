import { redactSensitiveString } from "../architecture/redaction";

export interface FileArtifact {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: number;
}

export interface FileAttachmentContext extends FileArtifact {
  textPreview?: string;
  textPreviewChars?: number;
  textTruncated?: boolean;
}

export interface GeneratedTextArtifact extends FileArtifact {
  textContent: string;
  textPreview: string;
  textTruncated?: boolean;
  source?: string;
}

export type GeneratedTextArtifactSummary = Omit<GeneratedTextArtifact, "textContent">;

export interface GeneratedTextArtifactDraft {
  id?: string;
  filename: string;
  mime?: string;
  textContent: string;
  source?: string;
}

export interface GeneratedArtifactStore {
  saveArtifact(artifact: GeneratedTextArtifactDraft): Promise<GeneratedTextArtifact>;
  listArtifacts(query?: { query?: string; limit?: number }): Promise<GeneratedTextArtifact[]>;
  loadArtifact(artifactId: string): Promise<GeneratedTextArtifact | undefined>;
}

export const MAX_TEXT_ATTACHMENT_PREVIEW_BYTES = 128_000;
export const MAX_TEXT_ATTACHMENT_PREVIEW_CHARS = 8_000;
export const MAX_GENERATED_ARTIFACT_CHARS = 256_000;
export const MAX_GENERATED_ARTIFACT_PREVIEW_CHARS = 1_200;

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "csv",
  "tsv",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "yaml",
  "yml",
  "log"
]);

export function sanitizeFileArtifacts(artifacts: readonly FileArtifact[] = [], limit = 10): FileArtifact[] {
  return artifacts
    .map((artifact) => ({
      id: String(artifact.id ?? "").trim(),
      filename: String(artifact.filename ?? "").trim(),
      mime: String(artifact.mime ?? "").trim() || "application/octet-stream",
      size: Number.isFinite(artifact.size) && artifact.size > 0 ? Math.round(artifact.size) : 0,
      createdAt: Number.isFinite(artifact.createdAt) && artifact.createdAt > 0 ? Math.round(artifact.createdAt) : Date.now()
    }))
    .filter((artifact) => artifact.id && artifact.filename)
    .slice(0, limit);
}

export function isTextAttachmentMime(mime: string): boolean {
  const normalized = mime.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("text/")) return true;
  if (normalized.endsWith("+json") || normalized.endsWith("+xml")) return true;
  return [
    "application/json",
    "application/ld+json",
    "application/xml",
    "application/xhtml+xml",
    "application/javascript",
    "application/ecmascript",
    "application/x-javascript",
    "application/x-www-form-urlencoded",
    "application/csv",
    "application/yaml",
    "application/x-yaml"
  ].includes(normalized);
}

export function isTextAttachmentFilename(filename: string): boolean {
  const normalized = filename.trim().toLowerCase();
  const match = /\.([a-z0-9]+)$/.exec(normalized);
  return Boolean(match && TEXT_ATTACHMENT_EXTENSIONS.has(match[1]));
}

export function canPreviewTextAttachment(
  artifact: Pick<FileArtifact, "filename" | "mime" | "size">,
  maxBytes = MAX_TEXT_ATTACHMENT_PREVIEW_BYTES
): boolean {
  const size = Number.isFinite(artifact.size) && artifact.size > 0 ? artifact.size : 0;
  return size <= maxBytes && (isTextAttachmentMime(artifact.mime) || isTextAttachmentFilename(artifact.filename));
}

export function stripFileArtifactPreviews(artifacts: readonly FileAttachmentContext[] = [], limit = 10): FileArtifact[] {
  return sanitizeFileArtifacts(artifacts, limit);
}

export function sanitizeFileAttachmentContexts(
  artifacts: readonly FileAttachmentContext[] = [],
  limit = 10,
  maxPreviewChars = MAX_TEXT_ATTACHMENT_PREVIEW_CHARS
): FileAttachmentContext[] {
  const sourcesById = new Map<string, FileAttachmentContext>();
  for (const artifact of artifacts) {
    const id = String(artifact.id ?? "").trim();
    if (!id || sourcesById.has(id)) continue;
    sourcesById.set(id, artifact);
  }

  return sanitizeFileArtifacts(artifacts, limit).map((metadata) => {
    const source = sourcesById.get(metadata.id);
    const rawPreview = typeof source?.textPreview === "string" ? source.textPreview.replace(/\u0000/g, "").trim() : "";
    if (!rawPreview) return metadata;
    const textPreview = rawPreview.slice(0, maxPreviewChars);
    return {
      ...metadata,
      textPreview,
      textPreviewChars: textPreview.length,
      textTruncated: Boolean(source?.textTruncated) || rawPreview.length > maxPreviewChars
    };
  });
}

export function sanitizeGeneratedTextArtifact(
  draft: GeneratedTextArtifactDraft,
  now = Date.now(),
  maxContentChars = MAX_GENERATED_ARTIFACT_CHARS
): GeneratedTextArtifact | undefined {
  const filename = sanitizeArtifactFilename(draft.filename);
  const textContent = String(draft.textContent ?? "")
    .replace(/\u0000/g, "")
    .slice(0, maxContentChars);
  const redactedTextContent = redactSensitiveString(textContent, { maxStringLength: maxContentChars });
  if (!filename || !redactedTextContent) return undefined;
  const id = sanitizeArtifactId(draft.id) || `artifact_${now.toString(36)}`;
  const mime = isTextAttachmentMime(String(draft.mime ?? "")) ? String(draft.mime).trim().toLowerCase() : mimeFromFilename(filename);
  const source = typeof draft.source === "string" && draft.source.trim() ? redactSensitiveString(draft.source.trim(), { maxStringLength: 300 }) : undefined;
  const createdAtSource = (draft as { createdAt?: unknown }).createdAt;
  const createdAt = typeof createdAtSource === "number" && Number.isFinite(createdAtSource) && createdAtSource > 0 ? Math.round(createdAtSource) : now;
  return {
    id,
    filename,
    mime,
    size: new TextEncoder().encode(redactedTextContent).byteLength,
    createdAt,
    textContent: redactedTextContent,
    textPreview: redactedTextContent.slice(0, MAX_GENERATED_ARTIFACT_PREVIEW_CHARS),
    textTruncated: redactedTextContent.length > MAX_GENERATED_ARTIFACT_PREVIEW_CHARS || String(draft.textContent ?? "").length > maxContentChars,
    ...(source ? { source } : {})
  };
}

export function stripGeneratedArtifactContent(artifacts: readonly GeneratedTextArtifact[] = [], limit = 20): GeneratedTextArtifactSummary[] {
  return artifacts.slice(0, limit).map((artifact) => ({
    id: artifact.id,
    filename: artifact.filename,
    mime: artifact.mime,
    size: artifact.size,
    createdAt: artifact.createdAt,
    textPreview: artifact.textPreview,
    textTruncated: artifact.textTruncated,
    ...(artifact.source ? { source: artifact.source } : {})
  }));
}

export function generatedArtifactMatches(artifact: GeneratedTextArtifact, query = ""): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [artifact.id, artifact.filename, artifact.mime, artifact.source, artifact.textPreview].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function sanitizeArtifactId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")
    .slice(0, 120);
}

function sanitizeArtifactFilename(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function mimeFromFilename(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".csv")) return "text/csv";
  if (normalized.endsWith(".tsv")) return "text/tab-separated-values";
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) return "text/markdown";
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "text/html";
  if (normalized.endsWith(".xml")) return "application/xml";
  return "text/plain";
}
