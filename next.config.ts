import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@sap/hana-client'],
  experimental: {},
}

export default nextConfig
