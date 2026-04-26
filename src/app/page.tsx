import React from 'react'
import { getServerSideURL } from '@/utilities/getURL'
import { getPayload } from 'payload'
import config from '@payload-config'

const ENV = process.env.NODE_ENV || 'development'
const VERSION = process.env.npm_package_version || '1.0.0'

const collections = [
  { name: 'vehicles', label: 'Vehicles' },
  { name: 'posts', label: 'Posts' },
  { name: 'pages', label: 'Pages' },
  { name: 'media', label: 'Media' },
  { name: 'categories', label: 'Categories' },
  { name: 'users', label: 'Users' },
  { name: 'comments', label: 'Comments' },
]

const globals = [
  { name: 'header', label: 'Header' },
  { name: 'footer', label: 'Footer' },
]

const externalLinks = [
  { name: 'Umami Analytics', url: 'https://cloud.umami.is', description: 'Suivi analytics' },
  { name: 'Stripe', url: 'https://dashboard.stripe.com', description: 'Paiements' },
  { name: 'Brevo', url: 'https://app.brevo.com', description: 'Emails transactionnels' },
  { name: 'Netlify', url: 'https://app.netlify.com', description: 'Frontend deployment' },
  { name: 'MongoDB Atlas', url: 'https://cloud.mongodb.com', description: 'Base de donnees' },
  { name: 'GitHub', url: 'https://github.com/Aurelmax/vanalexcars-cms', description: 'Repository backend' },
]

async function getHealthStatus(): Promise<boolean> {
  try {
    await getPayload({ config })
    return true
  } catch {
    return false
  }
}

export const dynamic = 'force-dynamic'

export default async function PortalPage() {
  const baseURL = getServerSideURL()
  const isHealthy = await getHealthStatus()

  return (
    <div style={styles.body}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.title}>VanalexCars API</h1>
          <p style={styles.subtitle}>Backend Headless - Payload CMS v3</p>
          <div style={styles.badges}>
            <span style={{ ...styles.badge, ...styles.badgeEnv }}>
              {ENV}
            </span>
            <span style={{ ...styles.badge, ...styles.badgeVersion }}>
              v{VERSION}
            </span>
            <span
              style={{
                ...styles.badge,
                ...(isHealthy ? styles.badgeHealthy : styles.badgeUnhealthy),
              }}
            >
              {isHealthy ? 'API OK' : 'API DOWN'}
            </span>
          </div>
        </header>

        {/* API Status */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Etat de l&apos;API</h2>
          <div style={styles.statusGrid}>
            <StatusCard
              label="Health Check"
              endpoint="/api/health"
              status={isHealthy}
              baseURL={baseURL}
            />
            <StatusCard
              label="GraphQL"
              endpoint="/api/graphql"
              status={true}
              baseURL={baseURL}
            />
            <StatusCard
              label="GraphQL Playground"
              endpoint="/api/graphql-playground"
              status={true}
              baseURL={baseURL}
            />
          </div>
        </section>

        {/* REST Endpoints */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Endpoints REST</h2>
          <div style={styles.endpointGrid}>
            {collections.map((col) => (
              <EndpointRow
                key={col.name}
                label={col.label}
                path={`/api/${col.name}`}
                baseURL={baseURL}
              />
            ))}
          </div>
        </section>

        {/* Globals */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Globals</h2>
          <div style={styles.endpointGrid}>
            {globals.map((g) => (
              <EndpointRow
                key={g.name}
                label={g.label}
                path={`/api/globals/${g.name}`}
                baseURL={baseURL}
              />
            ))}
          </div>
        </section>

        {/* Auth */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Authentification</h2>
          <div style={styles.endpointGrid}>
            <EndpointRow label="Login" path="/api/users/login" method="POST" baseURL={baseURL} />
            <EndpointRow label="Me" path="/api/users/me" baseURL={baseURL} />
            <EndpointRow label="Logout" path="/api/users/logout" method="POST" baseURL={baseURL} />
          </div>
        </section>

        {/* External Services */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Services externes</h2>
          <div style={styles.linksGrid}>
            {externalLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.linkCard}
              >
                <span style={styles.linkName}>{link.name}</span>
                <span style={styles.linkDesc}>{link.description}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Documentation */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Documentation</h2>
          <div style={styles.linksGrid}>
            <a
              href="https://payloadcms.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.linkCard}
            >
              <span style={styles.linkName}>Payload CMS Docs</span>
              <span style={styles.linkDesc}>Documentation officielle v3</span>
            </a>
            <a
              href={`${baseURL}/api/graphql-playground`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.linkCard}
            >
              <span style={styles.linkName}>GraphQL Playground</span>
              <span style={styles.linkDesc}>Explorer interactif GraphQL</span>
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer style={styles.footer}>
          <p>VanalexCars Backend &middot; {new Date().getFullYear()}</p>
          <p style={styles.footerSub}>{baseURL}</p>
        </footer>
      </div>
    </div>
  )
}

function StatusCard({
  label,
  endpoint,
  status,
  baseURL,
}: {
  label: string
  endpoint: string
  status: boolean
  baseURL: string
}) {
  return (
    <div style={styles.statusCard}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: status ? '#4ade80' : '#f87171',
        flexShrink: 0,
      }} />
      <div>
        <div style={styles.statusLabel}>{label}</div>
        <code style={styles.statusEndpoint}>{baseURL}{endpoint}</code>
      </div>
    </div>
  )
}

function EndpointRow({
  label,
  path,
  method = 'GET',
  baseURL,
}: {
  label: string
  path: string
  method?: string
  baseURL: string
}) {
  return (
    <div style={styles.endpointRow}>
      <span style={styles.methodBadge}>{method}</span>
      <span style={styles.endpointLabel}>{label}</span>
      <code style={styles.endpointPath}>{baseURL}{path}</code>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#e5e5e5',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '40px 24px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 48,
    paddingBottom: 32,
    borderBottom: '1px solid #262626',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: 0,
    color: '#ffffff',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 14,
    color: '#737373',
    margin: '8px 0 16px',
  },
  badges: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  badgeEnv: {
    backgroundColor: '#1e1e2e',
    color: '#a78bfa',
  },
  badgeVersion: {
    backgroundColor: '#1e1e2e',
    color: '#6b7280',
  },
  badgeHealthy: {
    backgroundColor: '#052e16',
    color: '#4ade80',
  },
  badgeUnhealthy: {
    backgroundColor: '#450a0a',
    color: '#f87171',
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#737373',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 12,
  },
  statusGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  statusCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    backgroundColor: '#141414',
    borderRadius: 8,
    border: '1px solid #262626',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: '#e5e5e5',
  },
  statusEndpoint: {
    fontSize: 12,
    color: '#525252',
  },
  endpointGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  endpointRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
    backgroundColor: '#141414',
    borderRadius: 6,
    border: '1px solid #1a1a1a',
  },
  methodBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 3,
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    fontFamily: 'monospace',
    minWidth: 36,
    textAlign: 'center' as const,
  },
  endpointLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#d4d4d4',
    minWidth: 100,
  },
  endpointPath: {
    fontSize: 12,
    color: '#525252',
    marginLeft: 'auto',
  },
  linksGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: 8,
  },
  linkCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '12px 16px',
    backgroundColor: '#141414',
    borderRadius: 8,
    border: '1px solid #262626',
    textDecoration: 'none',
    transition: 'border-color 0.2s',
  },
  linkName: {
    fontSize: 14,
    fontWeight: 500,
    color: '#e5e5e5',
  },
  linkDesc: {
    fontSize: 12,
    color: '#525252',
  },
  footer: {
    marginTop: 48,
    paddingTop: 24,
    borderTop: '1px solid #262626',
    textAlign: 'center' as const,
    fontSize: 13,
    color: '#525252',
  },
  footerSub: {
    fontSize: 11,
    color: '#3f3f3f',
    marginTop: 4,
  },
}
