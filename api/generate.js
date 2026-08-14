// This runs on the server (Vercel), never in the browser.
// It's the only place your Gemini API key ever lives.
//
// Converts our Anthropic-style { system, content } request into Gemini's
// request shape, then converts Gemini's response back into the same
// { content: [{ type: "text", text }] } shape the frontend already expects —
// so PrepPeriod.jsx doesn't need to know which provider is behind this.

const MODEL = "gemini-2.5-flash-lite";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server" });
  }

  const { system, content } = req.body || {};
  if (!content) {
    return res.status(400).json({ error: "Missing content" });
  }

  // content is either a plain string, or an array of Anthropic-style blocks:
  // { type: "text", text } or { type: "image", source: { media_type, data } }
  const parts = Array.isArray(content)
    ? content
        .map((block) => {
          if (block.type === "text") return { text: block.text };
          if (block.type === "image") {
            return {
              inline_data: {
                mime_type: block.source.media_type,
                data: block.source.data,
              },
            };
          }
          return null;
        })
        .filter(Boolean)
    : [{ text: content }];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({ error: data.error?.message || "Gemini API error" });
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("\n")
      .trim();

    // Normalized shape — matches what askClaude() in PrepPeriod.jsx already parses.
    res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    res.status(500).json({ error: "Could not reach Gemini API" });
  }
}
