/** Default Meta Graph/Marketing API version for unpinned agency configs. */
export const META_DEFAULT_GRAPH_VERSION = "v26.0" as const;

export type MetaGraphVersion = `v${number}.${number}`;

export function resolveMetaGraphVersion(override: string | null | undefined): MetaGraphVersion {
  if (override && /^v\d+\.\d+$/.test(override)) {
    return override as MetaGraphVersion;
  }
  return META_DEFAULT_GRAPH_VERSION;
}
