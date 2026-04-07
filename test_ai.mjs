import fs from 'fs';
import path from 'path';

const configPath = 'C:\\Users\\Rob\\AppData\\Roaming\\devote\\config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const apiKey = config.aiApiKey;
const esvApiKey = config.esvApiKey || 'd49a24d6323c36fa875b320a42e2ef0c86476c4c';

async function test() {
  try {
    const ref = "2 Chronicles 8-14";
    const esvUrl = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(ref)}&include-passage-references=false&include-footnotes=false&include-headings=false`;
    console.log("Fetching ESV:", esvUrl);
    
    let text = "Fake passage";
    const esvReq = await fetch(esvUrl, { headers: { 'Authorization': esvApiKey.startsWith('Token') ? esvApiKey : `Token ${esvApiKey}` } });
    if(esvReq.ok) {
      const data = await esvReq.json();
      text = data.passages[0];
      console.log("ESV fetch success, length:", text.length);
    } else {
      console.log("ESV fetch failed:", esvReq.status);
    }

    const prompt = `You are a thoughtful pastoral assistant. Read the following passage: ${text}. Generate exactly two deep, thought-provoking reflection questions focusing on personal application, spiritual growth, and deep contemplation based on this text. Do not include introductory text, just provide the two questions formatted clearly.`;

    let provider = 'google';
    let model = 'gemini-1.5-flash';
    let url = '';
    let headers = { 'Content-Type': 'application/json' };
    let body = {};

        const listReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const listData = await listReq.json();
        console.log("AVAILABLE MODELS:");
        listData.models.forEach(m => console.log(m.name, m.supportedGenerationMethods));
        return;
        body = {
            model: model,
            messages: [{ role: 'user', content: prompt }]
        };
    } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=redacted`;
        body = { contents: [{ parts: [{ text: prompt }] }] };
    }

    // patch real api key
    let realUrl = url.replace('redacted', apiKey);
    if(headers['Authorization']) headers['Authorization'] = `Bearer ${apiKey}`;

    console.log("Fetching AI:", provider, "model:", model);
    const aiReq = await fetch(realUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    if(!aiReq.ok) {
        let errText = await aiReq.text();
        // remove api key from error text if present
        errText = errText.split(apiKey).join('***RED');
        console.log("AI API Failed:", aiReq.status, errText);
    } else {
        const aiData = await aiReq.json();
        console.log("AI success:");
        
        // fake parser
        let textResponse = '';
        if (provider === 'google') textResponse = aiData.candidates[0].content.parts[0].text;
        else if (provider === 'openai') textResponse = aiData.choices[0].message.content;
        else if (provider === 'anthropic') textResponse = aiData.content[0].text;
        
        console.log("AI text length:", textResponse.length);
        const qArray = textResponse.split('\\n').filter(q => q.trim().length > 5).map(q => q.replace(/^[\\d\\.\\-\\*]\\s*/, '').trim());
        console.log("Questions parsed count:", qArray.length);
        console.log(qArray);
    }

  } catch(e) {
    console.error("Script error:", e);
  }
}
test();
