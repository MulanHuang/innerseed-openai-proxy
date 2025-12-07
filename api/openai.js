// Vercel Serverless Function - 支持流式输出
export default async function handler(req, res) {
  // 处理 OPTIONS 预检请求
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // 只允许 POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { model, messages, temperature, max_completion_tokens, stream } = req.body;

  // gpt-5-mini 是推理模型，需要更多 token
  const defaultTokens = 16000;

  const requestBody = {
    model: model || "gpt-5-mini",
    messages,
    temperature: temperature || 1,
    max_completion_tokens: max_completion_tokens || defaultTokens,
    stream: !!stream, // 🔥 传递 stream 参数给 OpenAI
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    // 🔥 流式模式：透传 SSE 流
    if (stream) {
      // 设置 SSE 响应头
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // 检查 OpenAI 是否返回成功
      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI error:", errorText);
        res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
        return res.end();
      }

      // 🔥 透传流数据
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          // 直接透传原始 SSE 数据
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        console.error("Stream error:", streamError);
        res.end();
      }
    } else {
      // 🔥 非流式模式：等待完整响应后返回
      const data = await response.json();
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(200).json(data);
    }
  } catch (error) {
    console.error("Proxy error:", error);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: error.message });
  }
}

