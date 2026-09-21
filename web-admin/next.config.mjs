/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The admin panel runs entirely in the browser and talks straight to Supabase (no server code),
  // so it is built as plain static files into `out/`. Any static host can serve that folder.
  output: 'export',
  // Each page becomes `<route>/index.html`, so links like /hisab work on hosts with no rewrite rules.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
