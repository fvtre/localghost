/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  experimental: {
    proxyClientMaxBodySize: '250mb',
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
