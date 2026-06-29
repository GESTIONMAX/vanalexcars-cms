/**
 * generateMandatePdf.ts
 * POST /api/generate-mandate-pdf
 * Body: { mandateId: string }
 * Returns: PDF file stream
 */

import type { PayloadHandler } from 'payload'

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return dateStr }
}

function formatCurrency(amount?: number | null): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

function buildMandateHtml(mandate: any): string {
  const c = mandate.clientInfo || {}
  const v = mandate.vehicleInfo || {}
  const d = mandate.dealerInfo || {}
  const s = mandate.serviceInfo || {}
  const t = mandate.taxesInfo || {}

  const totalEstimated = (v.vehiclePrice || 0) + (s.servicePrice || 0) + (t.registrationTaxEstimated || 0) + (t.ecologicalMalusEstimated || 0)

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Mandat VanalexCars — ${mandate.reference}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: white; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #F59E0B; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 22px; font-weight: 900; color: #1a1a1a; letter-spacing: -0.5px; }
    .logo span { color: #F59E0B; }
    .ref-block { text-align: right; }
    .ref-block .ref { font-size: 13px; font-weight: 700; color: #F59E0B; }
    .ref-block .date { font-size: 10px; color: #666; margin-top: 4px; }
    h1 { font-size: 16px; font-weight: 900; text-align: center; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
    .subtitle { text-align: center; font-size: 10px; color: #666; margin-bottom: 28px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .party-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .party-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #F59E0B; margin-bottom: 8px; border-bottom: 1px solid #fde68a; padding-bottom: 5px; }
    .party-box p { font-size: 10.5px; line-height: 1.7; }
    .party-box strong { font-weight: 700; }
    section { margin-bottom: 20px; }
    section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a1a1a; border-left: 3px solid #F59E0B; padding-left: 8px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    table th { background: #f9fafb; font-weight: 700; text-align: left; padding: 7px 10px; border: 1px solid #e5e7eb; font-size: 9.5px; text-transform: uppercase; color: #666; }
    table td { padding: 7px 10px; border: 1px solid #e5e7eb; }
    table tr:nth-child(even) td { background: #fafafa; }
    .total-row td { font-weight: 700; background: #fef3c7 !important; }
    .check { color: #16a34a; font-weight: 700; }
    .cross { color: #dc2626; }
    .notice { background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 14px; font-size: 10px; line-height: 1.6; margin-bottom: 16px; }
    .notice strong { font-weight: 700; }
    .legal { font-size: 9px; color: #666; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; }
    .signature-block { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 28px; }
    .sig-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .sig-box h4 { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 8px; }
    .sig-line { border-bottom: 1px solid #1a1a1a; height: 40px; margin-bottom: 6px; }
    .sig-box p { font-size: 9px; color: #999; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; }
    .badge-draft { background: #f3f4f6; color: #374151; }
    .badge-active { background: #d1fae5; color: #065f46; }
  </style>
</head>
<body>

  <!-- En-tête -->
  <div class="header">
    <div>
      <div class="logo">Vanalex<span>Cars</span></div>
      <div style="font-size:9px;color:#666;margin-top:4px;">Mandataire automobile — Antibes, France</div>
      <div style="font-size:9px;color:#666;">aurelien@vanalexcars.fr · +33 6 46 02 24 68</div>
    </div>
    <div class="ref-block">
      <div class="ref">Réf. ${mandate.reference}</div>
      <div class="date">Généré le ${formatDate(new Date().toISOString())}</div>
      <div style="margin-top:6px;"><span class="badge badge-draft">${mandate.status?.toUpperCase()}</span></div>
    </div>
  </div>

  <h1>Mandat de recherche, sélection<br/>et accompagnement à l'importation</h1>
  <p class="subtitle">Document contractuel — Veuillez lire attentivement avant de signer</p>

  <!-- Parties -->
  <div class="parties">
    <div class="party-box">
      <h3>Le Mandant (Client)</h3>
      <p>
        <strong>${c.firstName || ''} ${c.lastName || ''}</strong><br/>
        ${c.address ? c.address + '<br/>' : ''}
        ${c.postalCode ? c.postalCode + ' ' : ''}${c.city || ''}<br/>
        ${c.email || ''}<br/>
        ${c.phone || ''}
        ${c.identityDocumentType ? '<br/>Pièce d\'identité : ' + c.identityDocumentType.toUpperCase() + ' n°' + (c.identityDocumentNumber || '—') : ''}
      </p>
    </div>
    <div class="party-box">
      <h3>Le Mandataire (VanalexCars)</h3>
      <p>
        <strong>VanalexCars</strong><br/>
        Mandataire automobile indépendant<br/>
        Antibes, France<br/>
        aurelien@vanalexcars.fr<br/>
        +33 6 46 02 24 68<br/>
        vanalexcars.fr
      </p>
    </div>
  </div>

  <!-- Objet du mandat -->
  <div class="notice">
    <strong>Objet du mandat :</strong> Le Mandant confie au Mandataire la mission de recherche, sélection, vérification, négociation, accompagnement à la transaction, organisation du transport et assistance administrative dans le cadre de l'importation depuis l'Allemagne du véhicule identifié ci-dessous. Ce mandat porte sur le véhicule spécifiquement identifié et non sur une recherche générique.
  </div>

  <!-- Véhicule -->
  <section>
    <h2>Véhicule identifié</h2>
    <table>
      <tr><th>Marque</th><td>${v.brand || '—'}</td><th>Modèle</th><td>${v.model || '—'}</td></tr>
      <tr><th>Version</th><td>${v.version || '—'}</td><th>VIN</th><td>${v.vin || 'À compléter'}</td></tr>
      <tr><th>1ère immatriculation</th><td>${v.firstRegistrationDate || '—'}</td><th>Kilométrage</th><td>${v.mileage != null ? v.mileage.toLocaleString('fr-FR') + ' km' : '—'}</td></tr>
      <tr><th>Carburant</th><td>${v.fuelType || '—'}</td><th>Boîte</th><td>${v.transmission || '—'}</td></tr>
      <tr><th>Puissance</th><td>${v.power || '—'}</td><th>CO₂</th><td>${v.co2 != null ? v.co2 + ' g/km' : '—'}</td></tr>
      <tr><th>Couleur</th><td>${v.color || '—'}</td><th>TVA incluse</th><td>${v.vehicleVatIncluded ? 'Oui' : 'Non'}</td></tr>
      <tr><th colspan="2">Prix du véhicule</th><td colspan="2" style="font-weight:700;font-size:13px;">${formatCurrency(v.vehiclePrice)}</td></tr>
    </table>
  </section>

  <!-- Concessionnaire -->
  <section>
    <h2>Concessionnaire allemand</h2>
    <table>
      <tr><th>Établissement</th><td>${d.dealerName || '—'}</td><th>Pays</th><td>${d.dealerCountry || 'Allemagne'}</td></tr>
      <tr><th>N° de commande / offre</th><td>${d.dealerOrderNumber || '—'}</td><th>Date de l'offre</th><td>${formatDate(d.dealerOfferDate)}</td></tr>
    </table>
    <p style="font-size:9px;color:#999;margin-top:6px;">Le Mandant règle directement le prix du véhicule auprès du concessionnaire. VanalexCars n'encaisse jamais le prix du véhicule.</p>
  </section>

  <!-- Prestation -->
  <section>
    <h2>Périmètre de la mission VanalexCars</h2>
    <table>
      <tr>
        <th>Prestation incluse</th>
        <th style="text-align:center;">Inclus</th>
      </tr>
      <tr><td>Recherche & sélection du véhicule</td><td style="text-align:center;" class="check">✓</td></tr>
      <tr><td>Vérification auprès du concessionnaire officiel</td><td style="text-align:center;" class="check">✓</td></tr>
      <tr><td>Analyse du bon de commande allemand</td><td style="text-align:center;" class="check">✓</td></tr>
      <tr><td>Négociation du prix</td><td style="text-align:center;" class="check">✓</td></tr>
      <tr><td>Organisation du transport dédié (${s.transportProvider || 'Cars Trans'})</td><td style="text-align:center;"><span class="${s.transportIncluded ? 'check' : 'cross'}">${s.transportIncluded ? '✓' : '✗'}</span></td></tr>
      <tr><td>Démarches administratives complètes</td><td style="text-align:center;"><span class="${s.adminSupportIncluded ? 'check' : 'cross'}">${s.adminSupportIncluded ? '✓' : '✗'}</span></td></tr>
      <tr><td>Obtention du Certificat Provisoire d'Immatriculation (CPI)</td><td style="text-align:center;"><span class="${s.cpiIncluded ? 'check' : 'cross'}">${s.cpiIncluded ? '✓' : '✗'}</span></td></tr>
      <tr><td>Suivi jusqu'à la carte grise définitive</td><td style="text-align:center;"><span class="${s.finalRegistrationSupportIncluded ? 'check' : 'cross'}">${s.finalRegistrationSupportIncluded ? '✓' : '✗'}</span></td></tr>
      <tr><td>Livraison à domicile en France</td><td style="text-align:center;"><span class="${s.homeDeliveryIncluded ? 'check' : 'cross'}">${s.homeDeliveryIncluded ? '✓' : '✗'}</span></td></tr>
    </table>
  </section>

  <!-- Récapitulatif financier -->
  <section>
    <h2>Récapitulatif financier</h2>
    <table>
      <tr><th>Poste</th><th>Inclus forfait</th><th>Montant estimé</th></tr>
      <tr><td>Prix du véhicule (réglé au concessionnaire)</td><td style="text-align:center;" class="cross">✗</td><td style="text-align:right;">${formatCurrency(v.vehiclePrice)}</td></tr>
      <tr><td>Forfait VanalexCars (prestation tout compris)</td><td style="text-align:center;" class="check">✓</td><td style="text-align:right;">${formatCurrency(s.servicePrice || 1490)}</td></tr>
      <tr><td>Transport dédié Allemagne → France</td><td style="text-align:center;" class="check">✓</td><td style="text-align:right;">Inclus dans le forfait</td></tr>
      <tr><td>Carte grise (frais réglementaires)</td><td style="text-align:center;" class="cross">✗</td><td style="text-align:right;">${t.registrationTaxEstimated != null ? '~ ' + formatCurrency(t.registrationTaxEstimated) : 'À estimer'}</td></tr>
      <tr><td>Malus écologique (si applicable)</td><td style="text-align:center;" class="cross">✗</td><td style="text-align:right;">${t.ecologicalMalusEstimated != null ? '~ ' + formatCurrency(t.ecologicalMalusEstimated) : 'À estimer'}</td></tr>
      <tr class="total-row"><td colspan="2"><strong>TOTAL ESTIMÉ (hors carte grise si non renseignée)</strong></td><td style="text-align:right;">${formatCurrency(totalEstimated)}</td></tr>
    </table>
    ${t.notesAboutTaxes ? `<p style="font-size:9px;color:#666;margin-top:6px;font-style:italic;">${t.notesAboutTaxes}</p>` : ''}
    <p style="font-size:9px;color:#999;margin-top:8px;">Les estimations de carte grise et de malus écologique sont communiquées à titre indicatif. Seul le montant calculé par l'administration française fait foi. Ces frais sont dus par le Mandant et réglés directement à l'administration.</p>
  </section>

  <!-- Acompte -->
  <section>
    <h2>Modalités de paiement</h2>
    <table>
      <tr><th>Acompte VanalexCars à la signature</th><td style="font-weight:700;">${formatCurrency(s.depositAmount)}</td></tr>
      <tr><th>Solde VanalexCars</th><td>${s.remainingBalance != null ? formatCurrency(s.remainingBalance) : formatCurrency((s.servicePrice || 1490) - (s.depositAmount || 0))}</td></tr>
      <tr><th>Prix véhicule (réglé au concessionnaire)</th><td>${formatCurrency(v.vehiclePrice)}</td></tr>
    </table>
    <p style="font-size:9px;color:#666;margin-top:6px;">Le mandat entre en vigueur uniquement après signature du présent document ET paiement de l'acompte VanalexCars.</p>
  </section>

  <!-- Clauses importantes -->
  <section>
    <h2>Clauses importantes</h2>
    <div class="notice" style="margin-bottom:0;">
      <strong>Le Mandataire n'est pas vendeur du véhicule.</strong> VanalexCars n'achète pas et ne revend pas le véhicule. Le Mandant achète directement le véhicule auprès du concessionnaire allemand. VanalexCars n'encaisse en aucun cas le prix du véhicule. Le forfait VanalexCars rémunère exclusivement la recherche, l'analyse, la coordination, l'organisation du transport et l'accompagnement administratif.
    </div>
  </section>

  <!-- Signature -->
  <div class="signature-block">
    <div class="sig-box">
      <h4>Le Mandant — ${c.firstName || ''} ${c.lastName || ''}</h4>
      <div class="sig-line"></div>
      <p>Lu et approuvé — Signature précédée de la mention manuscrite</p>
      <p style="margin-top:4px;">Date : _______________</p>
    </div>
    <div class="sig-box">
      <h4>Le Mandataire — VanalexCars</h4>
      <div class="sig-line"></div>
      <p>Aurélien — Mandataire automobile</p>
      <p style="margin-top:4px;">Date : _______________</p>
    </div>
  </div>

  <div class="legal">
    <strong>Informations légales :</strong> VanalexCars — Mandataire automobile indépendant — Antibes, France — aurelien@vanalexcars.fr. Le présent mandat est soumis au droit français. Tout litige sera porté devant les juridictions compétentes du ressort d'Antibes. Les estimations de frais administratifs (carte grise, malus) sont établies à partir des barèmes officiels en vigueur à la date de génération du document et peuvent évoluer. Seul le montant officiel calculé par l'administration compétente fait foi.
  </div>

</body>
</html>`
}

export const generateMandatePdfHandler: PayloadHandler = async (req): Promise<Response> => {
  const { payload } = req

  let body: { mandateId?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { mandateId } = body
  if (!mandateId) {
    return Response.json({ error: 'mandateId is required' }, { status: 400 })
  }

  let mandate: any
  try {
    mandate = await payload.findByID({ collection: 'import-mandates' as any, id: mandateId })
  } catch {
    return Response.json({ error: 'Mandate not found' }, { status: 404 })
  }

  // Generate HTML
  const html = buildMandateHtml(mandate)

  // Use playwright to convert HTML to PDF
  let pdfBuffer: Buffer
  try {
    const { chromium } = await import('playwright-core')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    await browser.close()
    pdfBuffer = Buffer.from(pdfUint8)
  } catch (e: any) {
    return Response.json({ error: 'PDF generation failed: ' + e.message }, { status: 500 })
  }

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="mandat-${mandate.reference || mandateId}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
    },
  })
}
