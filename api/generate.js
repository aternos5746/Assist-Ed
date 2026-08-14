// This runs on the server (Vercel), never in the browser.
// It's the only place your Groq API key ever lives.
//
// Groq uses the OpenAI-compatible chat completions format, which is different
// from both Anthropic's and Gemini's shapes. This function converts our
// { system, content } request into that format, then converts the response
// back into { content: [{ type: "text", text }] } — the same shape the
// frontend has expected all along, so PrepPeriod.jsx never needs to change.

const MODEL = "qwen/qwen3.6-27b";

function toOpenAIContent(content) {
  if (!Array.isArray(content)) return content; // plain string is fine as-is
  return content
    .map((block) => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "image") {
        return {
          type: "image_url",
          image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
        };
      }
      return null;
    })
    .filter(Boolean);
}

async function callGroq(apiKey, messages) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024 }),
    });
    const data = await groqRes.json();

    if (groqRes.ok) return { ok: true, data };

    const isBusy = groqRes.status === 429 || groqRes.status === 503;
    if (isBusy && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }

    return { ok: false, status: groqRes.status, data };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not set on the server" });
  }

  const { system, content } = req.body || {};
  if (!content) {
    return res.status(400).json({ error: "Missing content" });
  }

  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: toOpenAIContent(content) },
  ];

  try {
    const result = await callGroq(apiKey, messages);

    if (!result.ok) {
      const friendly =
        result.status === 429
          ? "Groq is busy right now even after retrying. Wait a minute and try again."
          : result.data.error?.message || "Groq API error";
      return res.status(result.status).json({ error: friendly });
    }

    const text = result.data.choices?.[0]?.message?.content || "";

    // Normalized shape — matches what askClaude() in PrepPeriod.jsx already parses.
    res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    res.status(500).json({ error: "Could not reach Groq API" });
  }
}
