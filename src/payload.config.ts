import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import sharp from 'sharp'

import { Categories } from './collections/Categories'
import { Comments } from './collections/Comments'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Vehicles } from './collections/Vehicles'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || process.env.DATABASE_URI || '',
  }),
  collections: [Pages, Posts, Media, Categories, Users, Comments, Vehicles],
  cors: [
    getServerSideURL(),
    'http://localhost:3001',              // Frontend local (dev)
    'http://localhost:3000',              // Frontend local alternatif
    'https://vanalexcars.vercel.app',     // Frontend Vercel (prod)
    'https://*.vercel.app',               // Tous les déploiements preview Vercel
  ].filter(Boolean),
  csrf: [
    getServerSideURL(),
    'http://localhost:3001',              // Frontend local (dev)
    'http://localhost:3000',              // Frontend local alternatif
    'https://vanalexcars.vercel.app',     // Frontend Vercel (prod)
    'https://*.vercel.app',               // Tous les déploiements preview Vercel
  ].filter(Boolean),
  globals: [Header, Footer],
  plugins: [
    ...plugins,
    // storage-adapter-placeholder
  ],
  endpoints: [
    {
      path: '/health',
      method: 'get',
      handler: async (req) => {
        return new Response('OK', { status: 200 });
      }
    }
  ],
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
