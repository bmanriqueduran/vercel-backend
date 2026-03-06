# Rare Expertise Chatbot — Vercel Deployment Guide

## For Your Dev: How to Deploy This

### What's Here

```
vercel-backend/
├── api/
│   ├── chat.js        ← Serverless function: Claude API conversations
│   └── capture.js     ← Serverless function: Brevo + NPI logging
├── package.json
└── vercel.json        ← Route configuration
```

### Step 1: Deploy to Vercel

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Navigate to the vercel-backend folder
cd vercel-backend

# Install dependencies
npm install

# Deploy
vercel

# Follow prompts — link to your Vercel account
# It will give you a URL like: https://rare-expertise-chatbot.vercel.app
```

### Step 2: Set Environment Variables

In the Vercel dashboard (Settings → Environment Variables), add:

| Variable | Required | Value |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Your Claude API key from console.anthropic.com |
| `BREVO_API_KEY` | ✅ Yes | Your Brevo API key from Settings → SMTP & API |
| `BREVO_LIST_ID` | ✅ Yes | The numeric ID of your "HCP Chatbot Leads" list in Brevo |
| `BREVO_TEMPLATE_ID` | Optional | Template ID for the summary email (create in Brevo first) |
| `NPI_WEBHOOK_URL` | Optional | Webhook URL to push captures to Google Sheets (via Zapier/Make/Apps Script web app) |
| `GOOGLE_SHEET_ID` | Optional | For direct Google Sheets API integration |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional | Service account credentials for Sheets API |

### Step 3: Test the Endpoints

```bash
# Test chat endpoint
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me about GIST","specialty":"oncology"}'

# Test capture endpoint
curl -X POST https://your-app.vercel.app/api/capture \
  -H "Content-Type: application/json" \
  -d '{"contact":{"email":"test@example.com","firstName":"John","lastName":"Smith","specialty":"oncology","site":"Rare Oncology News"}}'
```

### Step 4: Update the WordPress Embed

In the WordPress embed snippet, change the `serverUrl` to your Vercel deployment URL:

```javascript
var RE_CHAT_CONFIG = {
  serverUrl: 'https://rare-expertise-chatbot.vercel.app',  // ← your Vercel URL
  // ... rest of config
};
```

### Step 5: NPI Pipeline Connection

The capture function needs to feed data into the Google Sheet that the existing NPI lookup script reads from. Three options:

**Option A: Zapier/Make webhook (easiest)**
1. Create a Zap: Webhook → Google Sheets (append row)
2. Set the webhook URL as `NPI_WEBHOOK_URL` in Vercel env vars
3. Map fields: Email, First Name, Last Name, Specialty

**Option B: Google Apps Script web app**
1. In your existing Google Sheet, create a new Apps Script
2. Deploy it as a web app that accepts POST requests
3. Set that URL as `NPI_WEBHOOK_URL`

Example Apps Script to add alongside your NPI script:
```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Test NPI Match');
  sheet.appendRow([
    data.email,
    data.firstName,
    data.lastName,
    data.specialty,
    '', // State (optional)
    '', // Matched NPI (filled by your script)
    '', // Confidence (filled by your script)
    '', // Reason (filled by your script)
  ]);
  return ContentService.createTextOutput('OK');
}
```

**Option C: Direct Google Sheets API** (more complex, requires service account setup)

---

## Brevo Setup Checklist

1. **Create a contact list** called "HCP Chatbot Leads" — note the numeric list ID
2. **Create custom attributes** in Brevo (Settings → Contacts → Attributes):
   - SPECIALTY (text)
   - SOURCE_SITE (text)
   - CAPTURED_VIA (text)
   - CAPTURE_DATE (text)
   - FIRST_PAGE (text)
   - LAST_CHATBOT_INTERACTION (text)
3. **Create a transactional email template** for the conversation summary
   - Use variables: {{ params.DOCTOR_NAME }}, {{ params.SITE_NAME }}, {{ params.RESOURCE_LINKS }}, {{ params.DATE }}
   - Note the template ID

---

## Cost Summary

| Service | Monthly Cost |
|---------|-------------|
| Vercel (free tier: 100K invocations) | $0 |
| Vercel (Pro, if needed) | $20 |
| Claude API (Sonnet, ~1000 conversations) | $10-20 |
| Brevo | Already paying |
| Zapier (if used, free tier: 100 tasks/mo) | $0 |
| **Total** | **$10-40** |

---

## Architecture Diagram

```
  WordPress Sites (x17)
        │
        │ JavaScript widget embed
        ▼
  ┌──────────────────┐
  │ Vercel Serverless │
  │                  │
  │  /api/chat       │──── Claude API (Sonnet)
  │  /api/capture    │──┬─ Brevo (contact + email)
  │                  │  └─ Webhook → Google Sheet
  └──────────────────┘
                              │
                              ▼
                    NPI Lookup Script
                    (existing, unchanged)
                              │
                              ▼
                    Pharma Client Reports
```
