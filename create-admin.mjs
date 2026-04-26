import { getPayload } from 'payload'
import config from './src/payload.config.ts'

const createAdmin = async () => {
  const payload = await getPayload({ config })
  
  await payload.create({
    collection: 'users',
    data: {
      email: 'admin@vanalexcars.com',
      password: 'Admin123!',
    },
  })
  
  console.log('Admin créé : admin@vanalexcars.com / Admin123!')
  process.exit(0)
}

createAdmin()
