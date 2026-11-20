/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["pg"],
  // db/*.sql is read at runtime by /setup to initialise an empty database
  outputFileTracingIncludes: { "/setup": ["./db/*.sql"] },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
