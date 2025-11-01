import {
  datasetPointerSchema,
  datasetPointerWithoutMetadataSchema,
  type DatasetPointer,
} from "../shared/queueSchema.ts";

export type { DatasetPointer } from "../shared/queueSchema";

const DATASET_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,62}$/i;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/;

interface DatasetWriteOptions {
  updatedAt?: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  baseUrl?: string;
}

function assertValidDatasetName(dataset: string): string {
  if (!DATASET_NAME_PATTERN.test(dataset)) {
    throw new Error(
      `Invalid dataset name "${dataset}". Use alphanumeric with optional hyphen/underscore.`,
    );
  }
  return dataset;
}

function assertValidVersion(version: string): string {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `Invalid dataset version "${version}". Use alphanumeric plus - _ . characters.`,
    );
  }
  return version;
}

function pointerKey(dataset: string): string {
  return `data/${dataset}:current`;
}

function contentKey(dataset: string, version: string): string {
  return `data/${dataset}:content:${version}`;
}

function datasetVersionUrl(dataset: string, version: string): string {
  return `/data/${dataset}.${version}.json`;
}

export async function readDatasetPointer(
  kv: KVNamespace,
  dataset: string,
): Promise<DatasetPointer | null> {
  const safeName = assertValidDatasetName(dataset);
  const record = await kv.get(pointerKey(safeName), { type: "json" });
  if (!record) return null;

  const parsed = datasetPointerSchema.safeParse(record);
  if (!parsed.success) {
    console.warn(
      `[Dataset] Pointer for "${dataset}" is malformed; ignoring entry.`,
      parsed.error,
    );
    return null;
  }

  return parsed.data;
}

export async function readDatasetJSON<TValue>(
  kv: KVNamespace,
  dataset: string,
): Promise<TValue | null> {
  const pointer = await readDatasetPointer(kv, dataset);
  if (!pointer) return null;

  const raw = await kv.get(contentKey(dataset, pointer.version));
  if (raw === null) {
    console.warn(
      `[Dataset] Content for "${dataset}" (version ${pointer.version}) missing.`,
    );
    return null;
  }

  try {
    const value = JSON.parse(raw) as TValue;
    return value;
  } catch (error) {
    console.error(
      `[Dataset] Failed to parse JSON for "${dataset}" version ${pointer.version}:`,
      error,
    );
    return null;
  }
}

export async function readDatasetVersion(
  kv: KVNamespace,
  dataset: string,
  version: string,
): Promise<string | null> {
  const safeName = assertValidDatasetName(dataset);
  const safeVersion = assertValidVersion(version);
  return kv.get(contentKey(safeName, safeVersion));
}

export async function writeDatasetJSON(
  kv: KVNamespace,
  dataset: string,
  version: string,
  value: unknown,
  options: DatasetWriteOptions = {},
): Promise<DatasetPointer> {
  const content = JSON.stringify(value);
  return writeDatasetVersion(kv, dataset, version, content, options);
}

async function writeDatasetVersion(
  kv: KVNamespace,
  dataset: string,
  version: string,
  content: string,
  options: DatasetWriteOptions = {},
): Promise<DatasetPointer> {
  const safeName = assertValidDatasetName(dataset);
  const safeVersion = assertValidVersion(version);

  const encoder = new TextEncoder();
  const size = encoder.encode(content).length;
  const updatedAt = options.updatedAt ?? new Date().toISOString();

  const href = datasetVersionUrl(safeName, safeVersion);

  let pointerUrl = href;
  if (options.baseUrl && options.baseUrl.length > 0) {
    try {
      pointerUrl = new URL(href, options.baseUrl).toString();
    } catch (error) {
      console.warn(
        `[Dataset] Failed to resolve base URL "${options.baseUrl}" for dataset "${dataset}":`,
        error,
      );
      pointerUrl = href;
    }
  }

  const pointer = datasetPointerWithoutMetadataSchema.parse({
    dataset: safeName,
    version: safeVersion,
    url: pointerUrl,
    updatedAt,
    size,
    hash:
      typeof options.hash === "string" && options.hash.length > 0
        ? options.hash
        : undefined,
  });

  await kv.put(contentKey(safeName, safeVersion), content, {
    metadata: {
      dataset: safeName,
      version: safeVersion,
      updatedAt,
      hash: options.hash ?? null,
      ...options.metadata,
    },
  });

  await kv.put(pointerKey(safeName), JSON.stringify(pointer));

  return pointer;
}

export async function pruneDatasetVersions(
  kv: KVNamespace,
  dataset: string,
): Promise<number> {
  const safeName = assertValidDatasetName(dataset);
  const pointer = await readDatasetPointer(kv, safeName);
  if (!pointer) {
    console.warn(
      `[Dataset] Cannot prune "${dataset}" because the pointer is missing or invalid.`,
    );
    return 0;
  }

  const currentContentKey = contentKey(safeName, pointer.version);
  const prefix = `data/${safeName}:content:`;

  const toDelete: string[] = [];
  let hasCurrentVersion = false;
  let cursor: string | null = null;

  do {
    const options: Parameters<KVNamespace["list"]>[0] =
      cursor !== null ? { prefix, cursor } : { prefix };
    const result: KVNamespaceListResult<unknown> = await kv.list(options);
    cursor = result.list_complete ? null : (result.cursor ?? null);

    for (const record of result.keys) {
      if (record.name === currentContentKey) {
        hasCurrentVersion = true;
        continue;
      }
      toDelete.push(record.name);
    }
  } while (cursor);

  if (!hasCurrentVersion) {
    console.warn(
      `[Dataset] Skipping prune for "${dataset}" because version "${pointer.version}" is missing.`,
    );
    return 0;
  }

  if (toDelete.length === 0) {
    return 0;
  }

  await Promise.all(toDelete.map((name) => kv.delete(name)));
  return toDelete.length;
}
