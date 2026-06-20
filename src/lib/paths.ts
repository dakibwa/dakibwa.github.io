const rawSiteBasePath = process.env.SITE_BASE_PATH?.replace(/^\/+|\/+$/g, "") ?? "";

export const SITE_BASE_PATH = rawSiteBasePath ? `/${rawSiteBasePath}` : "";

export function publicAssetPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${SITE_BASE_PATH}${normalizedPath}`;
}

export function publicAssetUrl(path: string) {
  return `url("${publicAssetPath(path)}")`;
}
