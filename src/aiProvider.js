// AI provider 抽象层：Claude 和 OpenAI(兼容接口) 都支持，靠 .env 的 AI_PROVIDER 切换。
// 用 Node 18+ 自带 fetch，不引第三方 SDK，VPS 上更省心。
import { config } from './config.js';

// messages: [{ role: 'user'|'assistant', content: '...' }]
// 返回 AI 的纯文本回复。
export async function chatComplete({ system, messages }) {
  const provider = config.ai.provider;
  if (provider === 'openai') return openaiChat({ system, messages });
  return claudeChat({ system, messages });
}

async function claudeChat({ system, messages }) {
  const { apiKey, model, baseUrl } = config.ai.claude;
  if (!apiKey) throw new Error('未配置 ANTHROPIC_API_KEY');

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API 错误 ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function openaiChat({ system, messages }) {
  const { apiKey, model, baseUrl } = config.ai.openai;
  if (!apiKey) throw new Error('未配置 OPENAI_API_KEY');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI API 错误 ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}
