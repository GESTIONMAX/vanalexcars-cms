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
import { scrapeGalleryHandler } from './endpoints/scrapeGallery'
import { enrichVehicleHandler } from './endpoints/enrichVehicle'
import { ImportMandates } from './collections/ImportMandates'
import { Leads } from './collections/Leads'
import { generateMandatePdfHandler } from './endpoints/generateMandatePdf'
import { searchAs24Handler } from './endpoints/searchAs24'
import { bulkEnrichHandler } from './endpoints/bulkEnrich'
import { importVehiclesHandler } from './endpoints/importVehicles'
import { importSingleListingHandler } from './endpoints/importSingleListing'

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
  collections: [Pages, Posts, Media, Categories, Users, Comments, Vehicles, ImportMandates, Leads],
  cors: [
    getServerSideURL(),
    'http://localhost:3000',
    'http://localhost:3001',
    'https://api.import-voiture-allemagne.fr',
    'https://vanalexcars.netlify.app',
    'https://www.import-voiture-allemagne.fr',
    process.env.FRONTEND_URL,
  ].filter((v): v is string => Boolean(v)),
  csrf: [
    getServerSideURL(),
    'http://localhost:3000',
    'http://localhost:3001',
    'https://api.import-voiture-allemagne.fr',
    'https://vanalexcars.netlify.app',
    'https://www.import-voiture-allemagne.fr',
    process.env.FRONTEND_URL,
  ].filter((v): v is string => Boolean(v)),
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
    },
    {
      path: '/scrape-gallery',
      method: 'post',
      handler: scrapeGalleryHandler,
    },
    {
      path: '/enrich-vehicle',
      method: 'post',
      handler: enrichVehicleHandler,
    },
    {
      path: '/generate-mandate-pdf',
      method: 'post',
      handler: generateMandatePdfHandler,
    },
    {
      path: '/search-as24',
      method: 'post',
      handler: searchAs24Handler,
    },
    {
      path: '/bulk-enrich',
      method: 'post',
      handler: bulkEnrichHandler,
    },
    {
      path: '/import-vehicles',
      method: 'post',
      handler: importVehiclesHandler,
    },
    {
      path: '/import-single',
      method: 'post',
      handler: importSingleListingHandler,
    },
    {
      path: '/bulk-enrich',
      method: 'options',
      handler: async () => new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-secret, Authorization',
        },
      }),
    },
  ],
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
