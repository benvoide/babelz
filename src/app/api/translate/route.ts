import { NextRequest, NextResponse } from "next/server";
import { extractTextFromPdf } from "@/lib/pdf";
import { chunkText } from "@/lib/chunker";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se subió ningún archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fullText = await extractTextFromPdf(buffer);

    if (!fullText.trim()) {
      return NextResponse.json({ error: "No se pudo extraer texto del PDF" }, { status: 400 });
    }

    const chunks = chunkText(fullText);

    return NextResponse.json({
      success: true,
      chunksCount: chunks.length,
      originalText: fullText,
      chunks: chunks.map((c) => ({
        index: c.index,
        text: c.text,
        context: c.context,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}