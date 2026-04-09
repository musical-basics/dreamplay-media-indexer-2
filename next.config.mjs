/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow serving local thumbnail images
  images: {
    unoptimized: true,
  },
  // Required for better-sqlite3 server-side only
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
