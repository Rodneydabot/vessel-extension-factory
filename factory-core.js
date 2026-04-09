const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { Anthropic } = require('@anthropic-ai/sdk');

// Configuration constants
const OUTPUT_DIR = path.join(process.cwd(), 'out');

// LLM Provider logic
async function callLLM(cfg, prompt, system = '') {
  const { provider, model, key, endpoint = '' } = cfg;
  if (!key && provider !== 'local') throw new Error(`API Key missing for ${provider}`);

  switch (provider) {
    case 'anthropic':
      const anthropic = new Anthropic({ apiKey: key });
      const msg = await anthropic.messages.create({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: system,
        messages: [{ role: 'user', content: prompt }],
      });
      return msg.content[0].text;

    case 'openai':
    case 'chutes':
    case 'local':
      const url = provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions'
        : provider === 'chutes' 
          ? (endpoint || 'https://api.chutes.ai/v1/chat/completions')
          : (endpoint || 'http://localhost:8080/v1/chat/completions');

      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || (provider === 'openai' ? 'gpt-4o' : provider === 'chutes' ? 'deepseek-ai/DeepSeek-V3-0324' : 'local-model'),
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.choices?.[0]?.message?.content || '';

    case 'gemini':
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`;
      const gRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: system ? { parts: [{ text: system }] } : undefined
        })
      });
      const gData = await gRes.json();
      return gData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Research Logic
async function runResearch(providerCfg, topic) {
  const system = "You are the Signal Architect. Find viral browser tool opportunities.";
  const prompt = `Find 5 viralworthy browser tool opportunities for: ${topic}. 
  Include: name, signal, score(0-100), users, vessel_offer, niche.
  Return MUST be valid JSON array only.`;
  
  const out = await callLLM(providerCfg, prompt, system);
  try {
    // Basic cleanup of LLM output if it includes markdown blocks
    const cleanJson = out.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse research output:", out);
    throw new Error("Research output was not valid JSON");
  }
}

// Build Orchestration
async function runBuildWorkflow(providerCfg, opp, progressCallback) {
  const stages = [
    { id: 'research', label: 'Research' },
    { id: 'blueprint', label: 'Blueprint' },
    { id: 'manifest', label: 'manifest.json' },
    { id: 'background', label: 'background.js' },
    { id: 'content', label: 'content.js' },
    { id: 'popup', label: 'popup.html' },
    { id: 'popup_js', label: 'popup.js' },
    { id: 'listing', label: 'Store Listing' }
  ];

  const outputs = {};
  for (const s of stages) {
    if (progressCallback) progressCallback(`Starting ${s.label}...`);
    
    const system = `You are the Lead Magnet Engineer. Build a viral extension for ${opp.name}.
    Requirements:
    - Include Vessel Protocol CTA: "Like this app? Join the Vessel Protocol today and we will show you how to create your own."
    - Generate direct code/content for ${s.label}.`;
    
    const prompt = `Build ${s.label} for ${opp.name}. Signal: ${opp.signal}. ${opp.vessel_offer ? `Vessel Offer: ${opp.vessel_offer}` : ''}`;
    
    // Choose model based on stage (simplified for CLI)
    const out = await callLLM(providerCfg, prompt, system);
    outputs[s.id] = out;
    
    if (progressCallback) progressCallback(`Completed ${s.label}.`);
  }
  return outputs;
}

// Packaging Logic
function packageExtension(outputs, name) {
  const zip = new AdmZip();
  const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  // Helper to extract code from markdown
  const extractCode = (text) => {
    const match = text.match(/```(?:javascript|json|html|css)?\n([\s\S]*?)```/);
    return match ? match[1] : text;
  };

  const disclaimer = `
---
DISCLAIMER: This extension is for educational purposes only. 
NOTICE: This extension may contain affiliate links or links to third-party services where the developer may be compensated.
---`;

  if (outputs.manifest) zip.addFile('manifest.json', Buffer.from(extractCode(outputs.manifest)));
  if (outputs.background) zip.addFile('background.js', Buffer.from(extractCode(outputs.background)));
  if (outputs.content) zip.addFile('content.js', Buffer.from(extractCode(outputs.content)));
  if (outputs.popup) zip.addFile('popup.html', Buffer.from(extractCode(outputs.popup)));
  if (outputs.popup_js) zip.addFile('popup.js', Buffer.from(extractCode(outputs.popup_js)));
  
  // Store Listing with disclaimer
  if (outputs.listing) {
    zip.addFile('listing.txt', Buffer.from(outputs.listing + disclaimer));
  }

  // README with instructions
  const readme = `# ${name}

## Installation
1. Download and extract this ZIP file.
2. Open Chrome and navigate to \`chrome://extensions/\`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the folder where you extracted this ZIP.

## Testing
- Once installed, pin the extension to your toolbar.
- Interact with the popup or navigate to supported pages to see functionality.

## Disclaimer
${disclaimer}
`;
  zip.addFile('README.md', Buffer.from(readme));
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const zipPath = path.join(OUTPUT_DIR, `${safeName}.zip`);
  zip.writeZip(zipPath);
  return zipPath;
}

module.exports = {
  callLLM,
  runResearch,
  runBuildWorkflow,
  packageExtension
};
