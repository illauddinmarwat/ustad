export function buildCheckoutUrl(path: string, webBaseUrl = 'https://ustad.app'): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
