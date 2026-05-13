function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(new Error('Invalid JSON from browser.')); }
    });
    req.on('error', reject);
  });
}

function findFirstNumber(obj, keys) {
  let found = null;
  function walk(x) {
    if (found !== null || x == null) return;
    if (Array.isArray(x)) { for (const i of x) walk(i); return; }
    if (typeof x === 'object') {
      for (const k of Object.keys(x)) {
        const lower = k.toLowerCase();
        if (keys.some(key => lower.includes(key)) && typeof x[k] === 'number') { found = x[k]; return; }
      }
      for (const k of Object.keys(x)) walk(x[k]);
    }
  }
  walk(obj);
  return found;
}

function collectWordScores(obj) {
  const out = [];
  function walk(x) {
    if (x == null) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') {
      const word = x.word || x.text || x.word_text || x.label;
      const score = x.quality_score ?? x.pronunciation ?? x.score ?? x.phone_score;
      if (typeof word === 'string' && typeof score === 'number') out.push({ word, score });
      Object.values(x).forEach(walk);
    }
  }
  walk(obj);
  const seen = new Set();
  return out.filter(w => {
    const key = w.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function highlightText(text, words) {
  let html = escapeHtml(text);
  for (const word of words) {
    const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`\\b(${safe})\\b`, 'gi'), '<span class="highlight">$1</span>');
  }
  return html;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Only POST is allowed.' });
  }

  try {
    const apiKey = process.env.SPEECHACE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing SPEECHACE_API_KEY in Vercel Environment Variables.' });

    const body = await readJson(req);
    const { audioBase64, contentType = 'audio/webm', filename = 'student-reading.webm', passage = '' } = body;
    if (!audioBase64 || !passage) return res.status(400).json({ error: 'Missing audio or passage.' });

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('text', passage);
    form.append('include_fluency', '1');
    form.append('include_intonation', '1');
    form.append('no_mc', '1');
    form.append('user_audio_file', new Blob([audioBuffer], { type: contentType }), filename);

    const endpoint = (process.env.SPEECHACE_ENDPOINT || 'https://api.speechace.co').replace(/\/$/, '');
    const dialect = process.env.SPEECHACE_DIALECT || 'en-us';
    const url = `${endpoint}/api/scoring/text/v9/json?key=${encodeURIComponent(apiKey)}&dialect=${encodeURIComponent(dialect)}`;

    const speechRes = await fetch(url, { method: 'POST', body: form });
    const rawText = await speechRes.text();
    console.log('Speechace raw response:', rawText.slice(0, 1000));

    let speechData;
    try { speechData = JSON.parse(rawText); }
    catch (e) {
      return res.status(502).json({
        error: 'Speechace did not return JSON.',
        message: rawText.slice(0, 500)
      });
    }

    if (!speechRes.ok || speechData.status === 'error') {
      return res.status(502).json({
        error: 'Speechace error.',
        message: speechData.detail_message || speechData.short_message || JSON.stringify(speechData).slice(0, 500)
      });
    }

    const pronunciation = Math.round(findFirstNumber(speechData, ['pronunciation', 'quality_score', 'speechace_score']) ?? 0);
    const fluency = Math.round(findFirstNumber(speechData, ['fluency']) ?? pronunciation);
    const wordScores = collectWordScores(speechData);
    const difficultWords = wordScores.filter(w => w.score < 75).slice(0, 12).map(w => w.word);
    const overall = Math.round((Number(pronunciation || 0) + Number(fluency || 0)) / 2);

    const feedback = pronunciation >= 85
      ? 'Your pronunciation is clear overall. Keep practising intonation and natural pauses.'
      : pronunciation >= 70
        ? 'Good effort. Practise the highlighted words and read long sentences more slowly.'
        : 'Please practise the difficult words again and focus on clear word endings and sentence stress.';

    return res.status(200).json({
      pronunciation,
      fluency,
      overall,
      difficultWords,
      highlightedText: highlightText(passage, difficultWords),
      feedback,
      raw: process.env.DEBUG_SPEECHACE === '1' ? speechData : undefined
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.', message: err.message });
  }
};
