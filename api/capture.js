// ============================================
// /api/capture — Vercel Serverless Function
// Captures HCP contact → Brevo + NPI sheet log
// ============================================

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_LIST_ID = parseInt(process.env.BREVO_LIST_ID || '0');
const BREVO_TEMPLATE_ID = parseInt(process.env.BREVO_TEMPLATE_ID || '0');

// Google Sheets integration (optional — for NPI pipeline)
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';

const ALLOWED_ORIGINS = [
  'https://wordpressmu-1555953-6187824.cloudwaysapps.com',
  'http://localhost',
  'http://127.0.0.1',
  'https://raremedicalnews.com',
  'https://rarecardiologynews.com',
  'https://raredermatologynews.com',
  'https://rareendocrinologynews.com',
  'https://raregastroenterologynews.com',
  'https://rarehematologynews.com',
  'https://rareinfectiousdiseasenews.com',
  'https://rareimmunologynews.com',
  'https://rarenephrologynews.com',
  'https://rareneurologynews.com',
  'https://rareoncologynews.com',
  'https://rareophthalmologynews.com',
  'https://rarepediatricsnews.com',
  'https://rareprimarycarenews.com',
  'https://rarepsychiatrynews.com',
  'https://rarepulmonologynews.com',
  'https://rarerheumatologynews.com',
  'https://raregeneticsnews.com',
];

module.exports = async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { contact, conversation, pageUrl, pageTitle } = req.body;

    if (!contact || !contact.email) {
      return res.status(400).json({ error: 'Contact email is required' });
    }

    const results = {
      brevo: null,
      email: null,
      npiLog: null,
    };

    // ---- 1. PUSH TO BREVO ----
    if (BREVO_API_KEY) {
      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY,
          },
          body: JSON.stringify({
            email: contact.email,
            attributes: {
              FIRSTNAME: contact.firstName || '',
              LASTNAME: contact.lastName || '',
              SPECIALTY: contact.specialty || '',
              SOURCE_SITE: contact.site || '',
              CAPTURED_VIA: 'chatbot',
              CAPTURE_DATE: contact.capturedAt || new Date().toISOString(),
              FIRST_PAGE: pageUrl || '',
            },
            listIds: BREVO_LIST_ID ? [BREVO_LIST_ID] : [],
            updateEnabled: true,
          }),
        });

        if (brevoRes.ok) {
          results.brevo = { success: true, data: await brevoRes.json() };
        } else if (brevoRes.status === 409) {
          // Contact exists — update it
          const updateRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'api-key': BREVO_API_KEY,
            },
            body: JSON.stringify({
              attributes: {
                FIRSTNAME: contact.firstName || '',
                LASTNAME: contact.lastName || '',
                SPECIALTY: contact.specialty || '',
                SOURCE_SITE: contact.site || '',
                LAST_CHATBOT_INTERACTION: new Date().toISOString(),
              },
            }),
          });
          results.brevo = { success: true, updated: true };
        } else {
          const err = await brevoRes.text();
          console.error('Brevo create error:', err);
          results.brevo = { success: false, error: err };
        }
      } catch (e) {
        console.error('Brevo error:', e.message);
        results.brevo = { success: false, error: e.message };
      }
    }

    // ---- 2. SEND SUMMARY EMAIL ----
    if (BREVO_API_KEY && BREVO_TEMPLATE_ID) {
      try {
        // Build resource links from conversation
        const links = [];
        (conversation || []).forEach(msg => {
          if (msg.role === 'assistant' && msg.content) {
            const matches = msg.content.match(/href="(https?:\/\/[^"]+)"/g);
            if (matches) {
              matches.forEach(m => {
                const url = m.replace('href="', '').replace('"', '');
                if (!links.includes(url)) links.push(url);
              });
            }
          }
        });

        const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY,
          },
          body: JSON.stringify({
            templateId: BREVO_TEMPLATE_ID,
            to: [{
              email: contact.email,
              name: `Dr. ${contact.lastName || ''}`,
            }],
            params: {
              DOCTOR_NAME: `Dr. ${contact.lastName || ''}`,
              SPECIALTY: contact.specialty || '',
              SITE_NAME: contact.site || 'Rare Medical Network',
              RESOURCE_LINKS: links.join('\n'),
              DATE: new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              }),
            },
          }),
        });

        results.email = { success: emailRes.ok };
      } catch (e) {
        console.error('Email error:', e.message);
        results.email = { success: false, error: e.message };
      }
    }

    // ---- 3. LOG FOR NPI ENRICHMENT ----
    // This logs the contact data that your NPI lookup script needs.
    // Option A: Google Sheets API (if configured)
    // Option B: Simple JSON log (Vercel logs, or send to a webhook)

    const npiRow = {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      specialty: contact.specialty,
      site: contact.site,
      pageUrl: pageUrl || '',
      capturedAt: contact.capturedAt || new Date().toISOString(),
    };

    // If you have a Google Sheet webhook or Zapier/Make integration:
    const NPI_WEBHOOK = process.env.NPI_WEBHOOK_URL || '';
    if (NPI_WEBHOOK) {
      try {
        await fetch(NPI_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(npiRow),
        });
        results.npiLog = { success: true };
      } catch (e) {
        results.npiLog = { success: false, error: e.message };
      }
    } else {
      // Fallback: log to Vercel console (visible in Vercel dashboard → Logs)
      console.log('📊 NPI_CAPTURE:', JSON.stringify(npiRow));
      results.npiLog = { success: true, method: 'console' };
    }

    return res.status(200).json({
      success: true,
      contact: contact.email,
      results,
    });

  } catch (error) {
    console.error('Capture error:', error.message);
    return res.status(500).json({ error: 'Capture service error' });
  }
};
