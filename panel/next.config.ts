import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @crm/db se comparte como código TypeScript: Next lo compila
  transpilePackages: ['@crm/db'],
  typedRoutes: true,
}

export default nextConfig
