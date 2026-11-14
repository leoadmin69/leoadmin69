// Client pour n'importe quelle API compatible OpenAI (Groq, OpenRouter, Gemini, Ollama, LM Studio...).
// Gère le streaming ET l'appel d'outils.

const cfg = () => ({
  base: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
  key: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
});

export const llmInfo = () => { const c = cfg(); return { base: c.base, model: c.model, configured: !!c.key }; };

/**
 * Envoie la conversation au modèle en streaming.
 * onToken(text) est appelé pour chaque morceau de texte.
 * Retourne { content, toolCalls }.
 */
export async function streamChat({ messages, tools, temperature = 0.6, onToken }) {
  const c = cfg();
  const body = { model: c.model, messages, temperature, stream: true };
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }

  let res = await fetch(`${c.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
    body: JSON.stringify(body),
  });
  // Certains modèles gratuits ne supportent pas les outils : on réessaie sans.
  if (!res.ok && tools?.length) {
    const txt = await res.text();
    if (/tool|function/i.test(txt)) return streamChat({ messages, tools: null, temperature, onToken });
    throw new Error(`API ${res.status} : ${txt.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`API ${res.status} : ${(await res.text()).slice(0, 300)}`);

  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  const calls = [];
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      const d = j.choices?.[0]?.delta;
      if (!d) continue;
      if (d.content) { content += d.content; onToken?.(d.content); }
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? calls.length;
        calls[i] ||= { id: tc.id || `call_${i}`, type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean) };
}
