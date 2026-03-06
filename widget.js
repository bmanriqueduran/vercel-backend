const REChat = (() => {
    // ---- STATE ----
    let isOpen = false;
    let user = null;
    let history = []; // {role, content} for API
    let captureState = 'idle';
    let msgCount = 0;
    let greeted = false;
    let apiKey = null;
    let apiConnected = false;

    const STORAGE_KEY = 're_test_user';
    const SPECIALTY = 'oncology';
    const SITE = 'Rare Oncology News';

    // ---- SYSTEM PROMPT ----
    const SYSTEM_PROMPT = `You are a rare disease knowledge assistant embedded on Rare Oncology News (rareoncologynews.com). You help healthcare professionals explore rare oncology conditions.

KEY BEHAVIORS:
- Answer clinical questions directly with real substance. You're talking to oncologists — use precise medical terminology.
- When asked about a condition, give actual clinical information: epidemiology, pathogenesis, diagnostic workup, treatment landscape, prognosis.
- Be concise: 2-3 short paragraphs max. No walls of text. Busy physicians want density, not fluff.
- When relevant, mention that more detailed information is available on the site (disease profiles, 5 Facts, Rare Mysteries).
- Ask a natural follow-up question to continue the conversation — about a related condition, a clinical scenario, or a deeper dive into treatment.
- Be collegial, like a knowledgeable colleague at a conference. Not stiff, not overly casual.

IMPORTANT:
- Frame everything as educational, from published literature and guidelines.
- Never say "I recommend" for specific patient management — say "current guidelines suggest" or "the standard approach includes."
- You are NOT a diagnostic tool. You are a knowledge resource.

You have particular depth of knowledge about:

GASTROINTESTINAL STROMAL TUMOR (GIST):
- Most common mesenchymal neoplasm of the GI tract (1-3% of all GI malignancies)
- Incidence: ~10-15 per million/year, median age at diagnosis 60-65
- Pathogenesis: ~75-80% harbor KIT mutations (exons 11, 9, 13, 17), ~5-10% PDGFRA mutations (exon 18 D842V most common), ~10-15% wild-type
- Diagnosis: CD117 (c-KIT) positive on IHC, DOG1 also highly specific. Endoscopic ultrasound for submucosal lesions. Biopsy can be challenging.
- Risk stratification: Miettinen/NIH criteria based on size, mitotic rate, location
- Treatment: Surgical resection is primary for localized. Imatinib 400mg for KIT exon 11, 800mg for exon 9. Sunitinib 2nd line, regorafenib 3rd line, ripretinib 4th line. Avapritinib for PDGFRA D842V.
- Adjuvant imatinib: 3 years for high-risk per SSGXVIII/AIO trial
- Key challenges: Secondary resistance mutations, wild-type GIST management, SDH-deficient GIST in young patients

CHONDROMYXOID FIBROMA (CMF):
- Rarest benign cartilaginous bone tumor, <1% of all bone tumors
- Peak incidence: 10-30 years, slight male predominance
- Location: Metaphysis of long bones (proximal tibia most common ~25%), also pelvis, foot bones, ribs
- Imaging: Well-defined eccentric lytic lesion with sclerotic rim, may have septations, no matrix mineralization (unlike enchondroma)
- Histology: Lobulated architecture with hypocellular myxoid/chondroid centers and hypercellular periphery. Stellate and spindle cells. Can mimic chondrosarcoma — this is a classic diagnostic pitfall.
- Genetics: Rearrangements involving chromosome 6q, particularly GRM1 gene
- Treatment: Extended curettage with adjuvant (phenol, cryotherapy, or bone cement) is preferred over simple curettage (recurrence 15-25% vs <5% with adjuvant). En bloc resection for recurrent or expendable bones.
- Malignant transformation: Exceptionally rare, essentially negligible
- Key DDx: Chondrosarcoma (most important to exclude), enchondroma, aneurysmal bone cyst, giant cell tumor

The current page the user is viewing has articles about both GIST and Chondromyxoid Fibroma.`;

    // ---- INIT ----
    function init() {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) {
            try { user = JSON.parse(s); captureState = 'captured'; } catch (e) { localStorage.removeItem(STORAGE_KEY); }
        }
    }

    // ---- API CONNECTION ----
    function connectAPI() {
        const input = document.getElementById('api-key-input');
        const status = document.getElementById('api-status');
        const key = input.value.trim();

        if (!key || !key.startsWith('sk-')) {
            status.textContent = '❌ Invalid key format. Should start with sk-ant-';
            status.className = 'status error';
            return;
        }

        apiKey = key;
        apiConnected = true;
        status.textContent = '✅ Connected — chatbot will use live Claude API responses';
        status.className = 'status connected';
    }

    // ---- TOGGLE ----
    function toggleChat() {
        isOpen = !isOpen;
        const win = document.getElementById('re-chat-window');
        document.getElementById('re-notif-dot').style.display = 'none';

        if (isOpen) {
            win.classList.add('visible');
            if (!greeted) { greeted = true; greet(); }
            setTimeout(() => document.getElementById('re-input').focus(), 350);
        } else {
            win.classList.remove('visible');
        }
    }

    // ---- GREETING ----
    function greet() {
        if (user) {
            const wb = document.getElementById('re-wb');
            wb.textContent = `Welcome back, Dr. ${user.lastName} 👋`;
            wb.classList.add('visible');
            botMsg(`Good to see you again! What would you like to explore in rare oncology today?`);
        } else {
            botMsg(`Hi! I'm your rare disease assistant for <strong>${SITE}</strong>. I can discuss rare oncology conditions in depth — from diagnostic workup to treatment landscapes. What can I help you with?`);
            setTimeout(() => {
                quickActions([
                    { label: '🔬 Tell me about GIST', msg: 'Tell me about gastrointestinal stromal tumors' },
                    { label: '🦴 Chondromyxoid Fibroma', msg: 'What is chondromyxoid fibroma?' },
                    { label: '🧩 Solve a clinical case', msg: 'Give me a clinical case to work through' },
                    { label: '📋 5 Facts challenge', msg: 'Test my knowledge with 5 facts about a rare cancer' },
                ]);
            }, 500);
        }
    }

    // ---- MESSAGING ----
    function botMsg(html) {
        const c = document.getElementById('re-msgs');
        const d = document.createElement('div');
        d.className = 're-msg bot';
        d.innerHTML = html;
        c.appendChild(d);
        scroll();
        history.push({ role: 'assistant', content: html.replace(/<[^>]*>/g, '') });
    }

    function userMsg(text) {
        const c = document.getElementById('re-msgs');
        const d = document.createElement('div');
        d.className = 're-msg user';
        d.textContent = text;
        c.appendChild(d);
        scroll();
        history.push({ role: 'user', content: text });
    }

    function quickActions(actions) {
        const c = document.getElementById('re-msgs');
        const d = document.createElement('div');
        d.className = 're-quick-actions';
        actions.forEach(a => {
            const b = document.createElement('button');
            b.textContent = a.label;
            b.onclick = () => { d.remove(); handleInput(a.msg); };
            d.appendChild(b);
        });
        c.appendChild(d);
        scroll();
    }

    function showTyping() {
        const c = document.getElementById('re-msgs');
        const d = document.createElement('div');
        d.className = 're-typing'; d.id = 're-typing';
        d.innerHTML = '<span></span><span></span><span></span>';
        c.appendChild(d);
        scroll();
    }
    function hideTyping() { const t = document.getElementById('re-typing'); if (t) t.remove(); }

    function scroll() {
        const c = document.getElementById('re-msgs');
        setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
    }

    // ---- INPUT HANDLING ----
    function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
    function resize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 90) + 'px'; }

    function send() {
        const input = document.getElementById('re-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.style.height = 'auto';
        handleInput(text);
    }

    async function handleInput(text) {
        userMsg(text);
        msgCount++;

        // Prompt for capture after 3 exchanges if not captured
        if (msgCount >= 3 && captureState === 'idle') {
            showTyping();
            await delay(1000);
            hideTyping();
            botMsg(`I'm enjoying this conversation! I can send you a concise summary with the key points and resource links we've covered — great for quick reference later.`);
            await delay(600);
            showCaptureForm();
            return;
        }

        showTyping();

        try {
            let response;
            if (apiConnected && apiKey) {
                response = await callClaudeAPI(text);
            } else {
                response = await getOfflineResponse(text);
            }
            hideTyping();
            botMsg(response);
        } catch (err) {
            hideTyping();
            console.error(err);
            // Fallback to offline if API fails
            const fallback = await getOfflineResponse(text);
            botMsg(fallback);
        }
    }

    // ---- CLAUDE API CALL ----
    async function callClaudeAPI(userMessage) {
        const msgs = history.slice(-16).map(m => ({
            role: m.role,
            content: m.content
        }));

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 600,
                system: SYSTEM_PROMPT,
                messages: msgs
            })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('API error:', err);
            throw new Error('API call failed');
        }

        const data = await res.json();
        let text = data.content[0].text;

        // Convert markdown-style formatting to HTML
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        text = text.replace(/\n\n/g, '<br><br>');
        text = text.replace(/\n/g, '<br>');

        return text;
    }

    // ---- OFFLINE RESPONSES ----
    // Rich pre-built responses for when no API key is provided
    async function getOfflineResponse(input) {
        await delay(800 + Math.random() * 1200);
        const q = input.toLowerCase();

        if (q.includes('gist') && (q.includes('diagnos') || q.includes('workup') || q.includes('how'))) {
            return `The diagnostic workup for GIST typically begins with cross-sectional imaging — CT with contrast is the standard, showing a well-circumscribed, hypervascular mass often arising from the stomach (60%) or small intestine (30%). For submucosal lesions, <strong>endoscopic ultrasound</strong> is particularly valuable, showing a hypoechoic mass arising from the muscularis propria (4th EUS layer).<br><br>Tissue diagnosis relies on <strong>CD117 (c-KIT) immunohistochemistry</strong>, which is positive in ~95% of GISTs. DOG1 is an excellent complementary marker, especially for KIT-negative cases. Mutational analysis (KIT exons 9, 11, 13, 17 and PDGFRA exon 18) is now standard, as it directly guides treatment selection — exon 9 mutations, for example, require higher-dose imatinib at 800mg.<br><br>One important caveat: percutaneous biopsy carries a small risk of tumor rupture and peritoneal seeding, so the approach depends on the clinical scenario. Have you encountered a specific presentation you're working through?`;
        }

        if (q.includes('gist') && (q.includes('treat') || q.includes('imatinib') || q.includes('therap'))) {
            return `The GIST treatment landscape has evolved considerably since imatinib's approval in 2002. For <strong>localized, resectable GIST</strong>, surgical resection with negative margins remains the cornerstone — no lymphadenectomy needed, as nodal metastasis is exceedingly rare.<br><br>For <strong>adjuvant therapy</strong>, high-risk patients (per Miettinen criteria) benefit from 3 years of imatinib 400mg daily, based on the SSGXVIII/AIO trial showing significant OS benefit over 1 year. The standard sequence for advanced/metastatic disease is now well established: <strong>imatinib → sunitinib → regorafenib → ripretinib</strong>. The game-changer for PDGFRA D842V-mutant GIST (historically imatinib-resistant) is <strong>avapritinib</strong>, with response rates over 80%.<br><br>The emerging challenge is SDH-deficient GIST in younger patients — these don't respond well to standard TKIs and require a different management approach. Is this area relevant to what you're seeing?`;
        }

        if (q.includes('gist') || q.includes('gastrointestinal stromal')) {
            return `<strong>Gastrointestinal Stromal Tumors (GIST)</strong> are the most common mesenchymal neoplasms of the GI tract, with an incidence of roughly 10-15 per million annually. The median age at diagnosis is 60-65, with equal gender distribution.<br><br>The pathogenesis centers on activating mutations in receptor tyrosine kinases: <strong>KIT mutations</strong> (75-80%, predominantly exon 11) and <strong>PDGFRA mutations</strong> (5-10%, with exon 18 D842V being the most common). About 10-15% are wild-type, which includes a distinct subset of <strong>SDH-deficient GISTs</strong> that occur in younger patients and behave differently.<br><br>Risk stratification using the Miettinen/NIH criteria (tumor size, mitotic rate, anatomic location) drives management decisions. The stomach carries the best prognosis site-by-site, while small bowel and rectal GISTs tend to be more aggressive at equivalent size and mitotic counts.<br><br>Would you like to dig into the diagnostic workup, the current treatment sequence, or the resistance mutation landscape?`;
        }

        if (q.includes('chondromyxoid') || q.includes('cmf') || q.includes('fibroma')) {
            return `<strong>Chondromyxoid fibroma (CMF)</strong> is genuinely one of the rarest bone tumors you'll encounter — less than 1% of all bone neoplasms. It peaks in the 10-30 age range with a slight male predominance.<br><br>On imaging, the classic appearance is a <strong>well-defined eccentric lytic lesion with a sclerotic rim</strong> in the metaphysis, most often the proximal tibia (~25% of cases). Importantly, there's no matrix mineralization — this helps distinguish it from enchondroma. Septations and lobulated margins are common.<br><br>The critical diagnostic pitfall is <strong>misdiagnosis as chondrosarcoma</strong>. Histologically, CMF shows lobulated architecture with hypocellular myxoid/chondroid centers surrounded by hypercellular periphery with stellate cells. The cellularity at the lobule periphery can mimic low-grade chondrosarcoma to the unwary pathologist.<br><br>Treatment-wise, <strong>extended curettage with adjuvant therapy</strong> (phenol, cryotherapy, or PMMA cement) has largely replaced simple curettage, dropping recurrence rates from 15-25% down to under 5%. Interested in the differential diagnosis approach or the surgical decision-making?`;
        }

        if (q.includes('case') || q.includes('mystery') || q.includes('clinical')) {
            return `Here's one for you:<br><br>A 34-year-old male presents with a 3-month history of progressive knee pain, worse at night. X-ray shows a well-defined, eccentric, lytic lesion in the proximal tibial metaphysis with a sclerotic border and lobulated margins. No periosteal reaction. No soft tissue mass. MRI shows a lesion with intermediate T1 signal and heterogeneous high T2 signal with lobulated architecture.<br><br>The orthopedic surgeon is concerned about chondrosarcoma and wants a wide resection. The radiologist suggests it could be an aneurysmal bone cyst.<br><br>Based on the imaging characteristics and patient demographics — <strong>what's your leading diagnosis, and would you push back on the surgeon's plan?</strong>`;
        }

        if (q.includes('5 fact') || q.includes('five fact') || q.includes('test') || q.includes('quiz')) {
            return `Let's do it — <strong>5 Facts: GIST Edition</strong> 🧠<br><br><strong>Fact #1:</strong> The most common site for GIST is the stomach (60%), followed by small intestine (30%), but <strong>rectal GISTs</strong>, though only ~5% of cases, carry the worst prognosis site-for-site compared to gastric GISTs of equal size and mitotic rate.<br><br>Did you know that? Rate yourself: ✅ Knew it, or 🤔 New to me?<br><br>Want Fact #2?`;
        }

        if (q.includes('resistance') || q.includes('mutation') || q.includes('secondary')) {
            return `Resistance in GIST is one of the most clinically relevant topics right now. <strong>Primary resistance</strong> is mostly seen in PDGFRA D842V mutants (inherently imatinib-resistant) and wild-type GIST. <strong>Secondary resistance</strong> typically emerges 18-24 months into imatinib therapy through acquired point mutations in KIT — often in the ATP-binding pocket (exons 13/14) or activation loop (exons 17/18).<br><br>The challenge is <strong>polyclonal resistance</strong>: different metastases can harbor different secondary mutations simultaneously. This is why <strong>ripretinib</strong> (a switch-control kinase inhibitor) was developed as a broad-spectrum KIT/PDGFRA inhibitor for the 4th-line setting — it was specifically designed to hit multiple resistance mutations at once.<br><br>Liquid biopsy (ctDNA) is emerging as a way to track resistance mutations in real-time without repeat tissue biopsies. Fascinating space. Are you seeing resistant GIST in your practice?`;
        }

        // Default
        return `That's a great question in the rare oncology space. The conditions we cover here range from common rare tumors like GIST (which represents a paradigm for targeted therapy in solid tumors) to exceedingly rare entities like chondromyxoid fibroma where diagnostic pitfalls are the main clinical challenge.<br><br>I can go deep on the molecular biology, diagnostic workup, treatment sequencing, or emerging clinical trial data for any rare oncology condition. What specific area would be most useful for your practice?<br><br>You might also enjoy our <a href="https://rareoncologynews.com/raremystery/" target="_blank">Rare Mystery cases</a> — they're clinical puzzles designed for exactly this kind of discussion.`;
    }

    // ---- CAPTURE ----
    function showCaptureForm() {
        captureState = 'prompted';
        const c = document.getElementById('re-msgs');
        const d = document.createElement('div');
        d.className = 're-capture-form'; d.id = 're-cap-form';
        d.innerHTML = `
      <p>Enter your info and I'll email you a summary with all the resources and references:</p>
      <input type="text" id="re-f" placeholder="First name" />
      <input type="text" id="re-l" placeholder="Last name" />
      <input type="email" id="re-e" placeholder="Email address" />
      <button onclick="REChat.capture()">Send me the summary →</button>
    `;
        c.appendChild(d);
        scroll();
        setTimeout(() => document.getElementById('re-f').focus(), 300);
    }

    function capture() {
        const f = document.getElementById('re-f').value.trim();
        const l = document.getElementById('re-l').value.trim();
        const e = document.getElementById('re-e').value.trim();

        if (!f) { document.getElementById('re-f').style.borderColor = '#ef4444'; return; }
        if (!l) { document.getElementById('re-l').style.borderColor = '#ef4444'; return; }
        if (!e || !e.includes('@')) { document.getElementById('re-e').style.borderColor = '#ef4444'; return; }

        user = { firstName: f, lastName: l, email: e, specialty: SPECIALTY, site: SITE, capturedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        captureState = 'captured';

        const form = document.getElementById('re-cap-form');
        if (form) form.remove();

        botMsg(`Thanks, Dr. ${l}! 🎉 I'll send a summary to <strong>${e}</strong>. Feel free to keep exploring — I'm here whenever you need me.`);
        document.getElementById('re-subtitle').textContent = `Dr. ${l} • Oncology`;

        // Log the capture
        console.log('📧 HCP CAPTURED:', user);
        console.log('📊 This data would flow to: Brevo → Google Sheet → NPI Lookup');
        console.log('📋 NPI script input: ', { firstName: f, lastName: l, specialty: SPECIALTY, email: e });

        setTimeout(() => {
            quickActions([
                { label: '🔬 More on GIST resistance', msg: 'Tell me about GIST resistance mutations' },
                { label: '🦴 CMF vs chondrosarcoma', msg: 'How do I distinguish chondromyxoid fibroma from chondrosarcoma?' },
            ]);
        }, 600);
    }

    // ---- RESET FUNCTIONS ----
    function resetChat() {
        // Reset conversation but keep user
        const c = document.getElementById('re-msgs');
        c.innerHTML = '';
        history = [];
        msgCount = 0;
        greeted = false;
        captureState = user ? 'captured' : 'idle';
        greet();
    }

    function resetAll() {
        // Full nuclear reset
        localStorage.removeItem(STORAGE_KEY);
        user = null;
        captureState = 'idle';
        msgCount = 0;
        greeted = false;
        history = [];

        const c = document.getElementById('re-msgs');
        c.innerHTML = '';
        const wb = document.getElementById('re-wb');
        wb.classList.remove('visible');
        document.getElementById('re-subtitle').textContent = 'Powered by Rare Oncology News';

        // Re-greet
        greet();
        console.log('🗑 Full reset — user data cleared, chat reset');
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    init();

    return {
        toggleChat,
        send,
        onKey,
        resize,
        capture,
        connectAPI,
        resetChat,
        resetAll,
        getUser: () => user,
    };
})();
