import OpenAI from "openai";

export interface TranslationOptions {
  apiKey?: string;
  model?: string;
  sourceLang: string;
  targetLang: string;
  onChunkDone?: (current: number, total: number, text: string) => void;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function buildClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "No se encontró API key de OpenRouter. Ingresala en la UI o definí OPENROUTER_API_KEY en el servidor."
    );
  }
  return new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey: key });
}

export async function translateChunks(
  chunks: { index: number; text: string; context: string }[],
  options: TranslationOptions
): Promise<string> {
  let previousTranslation = "";
  const translations: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const client = buildClient(options.apiKey);

    const systemPrompt = `Eres un traductor profesional. Traducís del ${options.sourceLang} al ${options.targetLang}.

Reglas:
- Traducí el texto manteniendo el estilo, tono y registro del original.
- Preservá nombres propios, títulos y términos especializados sin traducir.
- Mantené consistencia con la traducción previa (mismo vocabulario para términos recurrentes).
- Devolvé SOLO la traducción del texto nuevo, sin explicaciones ni notas.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    if (chunk.context) {
      messages.push({
        role: "user",
        content: `[CONTEXTO DEL TRADUCCIÓN ANTERIOR - usalo para mantener coherencia]\n${chunk.context}`,
      });
      messages.push({
        role: "assistant",
        content: previousTranslation || "(traducción no disponible)",
      });
    }

    messages.push({
      role: "user",
      content: `Texto a traducir:\n\n${chunk.text}`,
    });

    const response = await client.chat.completions.create({
      model: options.model || "deepseek/deepseek-chat",
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    });

    const translated = response.choices[0]?.message?.content?.trim() || "";
    translations.push(translated);
    previousTranslation = chunk.text;

    options.onChunkDone?.(i + 1, chunks.length, translated);
  }

  return translations.join("\n\n");
}
