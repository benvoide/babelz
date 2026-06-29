import { jsPDF } from "jspdf";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 22;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5.5;

interface Block {
  type: "heading" | "subheading" | "paragraph" | "list" | "marker" | "empty";
  text: string;
}

function detectBlocks(text: string): Block[] {
  const raw = text.split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];

  function flushBuffer() {
    if (buffer.length === 0) return;
    const joined = buffer.join("\n");
    blocks.push({ type: "paragraph", text: joined });
    buffer = [];
  }

  for (const line of raw) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushBuffer();
      blocks.push({ type: "empty", text: "" });
      continue;
    }

    const markerMatch = trimmed.match(/^\[(TABLA|GRÁFICO|DIAGRAMA|ILUSTRACIÓN|IMAGEN|TABLE|GRAPH|CHART|FIGURE).*?\]/i);
    if (markerMatch) {
      flushBuffer();
      blocks.push({ type: "marker", text: trimmed });
      continue;
    }

    const listMatch = trimmed.match(/^(\d+[\.\)]|[-*•·]|[\p{Pd}])\s+/u);
    if (listMatch) {
      flushBuffer();
      blocks.push({ type: "list", text: trimmed });
      continue;
    }

    const isHeading =
      trimmed.length < 70 &&
      !trimmed.endsWith(".") &&
      !trimmed.endsWith(":") &&
      !trimmed.endsWith(";") &&
      !trimmed.endsWith(",") &&
      !listMatch &&
      (
        trimmed === trimmed.toUpperCase() ||
        (trimmed.split(" ").length <= 8 && trimmed.endsWith(":") === false) ||
        /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,5}$/.test(trimmed)
      );

    if (isHeading && trimmed.length < 60 && trimmed.split(" ").length <= 8) {
      flushBuffer();
      blocks.push({ type: "heading", text: trimmed });
      continue;
    }

    buffer.push(trimmed);
  }

  flushBuffer();
  return blocks.filter((b) => b.type !== "empty" || true);
}

function writeText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineH: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y + lineH > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

export function generateTranslationPdf(translatedText: string, fileName: string): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const title = fileName.replace(/\.pdf$/i, "").replace(/^traducido[- ]?/i, "").trim() || "Traducción";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(`Traducción: ${title}`, CONTENT_WIDTH);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 8 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140, 130, 120);
  doc.text(`Generado por Babelz — ${new Date().toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" })}`, MARGIN, y);
  y += 6;
  doc.setTextColor(0, 0, 0);

  doc.setDrawColor(200, 190, 180);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  const blocks = detectBlocks(translatedText);

  for (const block of blocks) {
    if (block.type === "empty") {
      y += 3;
      continue;
    }

    if (y > PAGE_HEIGHT - MARGIN - 10) {
      doc.addPage();
      y = MARGIN;
    }

    switch (block.type) {
      case "heading": {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(50, 50, 50);
        y = writeText(doc, block.text, MARGIN, y, CONTENT_WIDTH, 7);
        y += 2;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        break;
      }
      case "subheading": {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(80, 80, 80);
        y = writeText(doc, block.text, MARGIN, y, CONTENT_WIDTH, 6);
        y += 1;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        break;
      }
      case "list": {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const indent = 6;
        y = writeText(doc, block.text, MARGIN + indent, y, CONTENT_WIDTH - indent, LINE_HEIGHT);
        break;
      }
      case "marker": {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(160, 150, 140);
        y = writeText(doc, block.text, MARGIN, y, CONTENT_WIDTH, 5);
        y += 1;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        break;
      }
      default: {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        y = writeText(doc, block.text, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT);
        y += 1;
        break;
      }
    }
  }

  return doc.output("blob");
}