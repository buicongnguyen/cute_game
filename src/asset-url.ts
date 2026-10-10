declare const __ZOO_ASSET_VERSIONS__: Record<string, string> | undefined;
const VERSIONS: Record<string, string> = typeof __ZOO_ASSET_VERSIONS__ === 'undefined' ? {} : __ZOO_ASSET_VERSIONS__ ?? {};

/**
 * URL of a file under public/assets/ ('icons/items/apple.webp', 'audio/zoo-garden-theme.mp3'). Builds tag it with the file's
 * content hash (?v=, vite.config.ts), like modelUrl() does for models: an unchanged file keeps its URL across deploys, so the
 * offline worker copies it from its previous cache instead of downloading it again. The dev server keeps plain URLs.
 */
export const assetUrl = (rel: string) => `${import.meta.env?.BASE_URL ?? '/'}assets/${rel}${VERSIONS[rel] ? `?v=${VERSIONS[rel]}` : ''}`;
