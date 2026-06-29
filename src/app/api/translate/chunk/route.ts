import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function buildClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("No se encontró API key de OpenRouter");
  }
  return new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey: key });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, context, previousTranslation, apiKey, sourceLang, targetLang, model } = body;

    if (!text) {
      return NextResponse.json({ error: "Falta el texto a traducir" }, { status: 400 });
    }

    const client = buildClient(apiKey || undefined);

    const systemPrompt = `Eres un traductor profesional. Traducís del ${sourceLang || "idioma original"} al ${targetLang || "español"}.

Reglas:
- Traducí el texto manteniendo el estilo, tono y registro del original.
- Preservá nombres propios, títulos y términos especializados sin traducir.
- Mantené consistencia con la traducción previa (mismo vocabulario para términos recurrentes).
- Devolvé SOLO la traducción del texto nuevo, sin explicaciones ni notas.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    if (context) {
      messages.push({
        role: "user",
        content: `[CONTEXTO DEL TRADUCCIÓN ANTERIOR - usalo para mantener coherencia]\n${context}`,
      });
      messages.push({
        role: "assistant",
        content: previousTranslation || "(traducción no disponible)",
      });
    }

    messages.push({
      role: "user",
      content: `Texto a traducir:\n\n${text}`,
    });

    const response = await client.chat.completions.create({
      model: model || "deepseek/deepseek-chat",
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    });

    const translated = response.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ success: true, translated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}