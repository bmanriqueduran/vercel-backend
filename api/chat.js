// ============================================
// /api/chat — Vercel Serverless Function
// Handles conversation with Claude API
// ============================================

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Allowed origins (your 17 sites + localhost for testing)
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

// System prompts per specialty
const SPECIALTY_PROMPTS = {
  oncology: `You are a rare disease knowledge assistant embedded on Rare Oncology News (rareoncologynews.com). You help healthcare professionals explore rare oncology conditions.

KEY BEHAVIORS:
- Answer clinical questions directly with real substance. You're talking to oncologists — use precise medical terminology.
- When asked about a condition, give actual clinical information: epidemiology, pathogenesis, diagnostic workup, treatment landscape, prognosis.
- Be concise: 2-3 short paragraphs max. No walls of text. Busy physicians want density, not fluff.
- When relevant, mention content on the site (disease profiles, 5 Facts, Rare Mysteries).
- Ask a natural follow-up question to keep the conversation going.
- Be collegial, like a knowledgeable colleague at a conference.

IMPORTANT:
- Frame everything as educational, from published literature and guidelines.
- Never say "I recommend" for specific patient management — say "current guidelines suggest" or "the standard approach includes."
- You are NOT a diagnostic tool. You are a knowledge resource.`,

  cardiology: `You are a rare disease knowledge assistant embedded on Rare Cardiology News (rarecardiologynews.com). You help healthcare professionals explore rare cardiovascular conditions.

KEY BEHAVIORS:
- Answer clinical questions directly with real substance. You're talking to cardiologists — use precise medical terminology.
- Cover rare cardiac conditions: cardiac amyloidosis, Brugada syndrome, ARVC, Fabry disease cardiac manifestations, rare cardiomyopathies, etc.
- Be concise: 2-3 short paragraphs max.
- Be collegial. Ask follow-up questions.

IMPORTANT:
- Frame everything as educational.
- You are NOT a diagnostic tool. You are a knowledge resource.`,

  // Add remaining specialties following the same pattern.
  // In production, you'd have all 17 here.
  // The pattern is identical — just swap the specialty focus and site name.

  _default: `You are a rare disease knowledge assistant. You help healthcare professionals explore rare disease conditions with precise, clinically relevant information. Be concise (2-3 paragraphs max), collegial, and educational. Frame everything from published guidelines and literature. You are a knowledge resource, not a diagnostic tool.`,
};

module.exports = async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history, specialty, user, pageUrl, pageTitle } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build system prompt
    let systemPrompt = SPECIALTY_PROMPTS[specialty] || SPECIALTY_PROMPTS._default;

    if (pageUrl || pageTitle) {
      systemPrompt += `\n\nThe user is currently viewing: "${pageTitle || ''}" at ${pageUrl || ''}. Reference this naturally if relevant.`;
    }
    if (user && user.lastName) {
      systemPrompt += `\n\nYou are speaking with Dr. ${user.lastName}, specialty: ${user.specialty || specialty}.`;
    }

    // Build messages — last 20 entries max
    const messages = (history || [])
      .slice(-20)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').replace(/<[^>]*>/g, '').trim(),
      }))
      .filter(m => m.content);

    messages.push({ role: 'user', content: message });

    // Ensure messages alternate properly
    const cleaned = [];
    for (const m of messages) {
      if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== m.role) {
        cleaned.push(m);
      } else {
        cleaned[cleaned.length - 1].content += '\n' + m.content;
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      system: systemPrompt,
      messages: cleaned,
    });

    let reply = response.content[0].text;

    // Convert markdown to basic HTML for the widget
    reply = reply.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    reply = reply.replace(/\*(.+?)\*/g, '<em>$1</em>');
    reply = reply.replace(/\n\n/g, '<br><br>');
    reply = reply.replace(/\n/g, '<br>');

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Chat API error:', error.message);
    return res.status(500).json({ error: 'Chat service temporarily unavailable' });
  }
};
