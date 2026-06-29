"use client";

import { useState, useRef, useCallback } from "react";

type Status = "idle" | "uploading" | "translating" | "done" | "error";

interface ChunkData {
  index: number;
  text: string;
  context: string;
}

interface DevEvent {
  event: string;
  data: string;
  ts: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("español");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [originalText, setOriginalText] = useState("");
  const [liveTranslation, setLiveTranslation] = useState("");
  const [result, setResult] = useState<{ original: string; translated: string } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [devMode, setDevMode] = useState(true);
  const [devLog, setDevLog] = useState<DevEvent[]>([]);
  const [chunkTime, setChunkTime] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<HTMLPreElement>(null);
  const translatedRef = useRef<HTMLPreElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const syncScroll = useCallback((source: HTMLPreElement, target: HTMLPreElement) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    syncingRef.current = false;
  }, []);

  const log = useCallback((event: string, data: unknown) => {
    const entry: DevEvent = {
      event,
      data: JSON.stringify(data, null, 2),
      ts: new Date().toLocaleTimeString(),
    };
    setDevLog((prev) => [...prev.slice(-200), entry]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;

    abortRef.current = false;
    setError("");
    setResult(null);
    setLiveTranslation("");
    setOriginalText("");
    setChunks([]);
    setChunkTime([]);
    setCurrent(0);
    setTotal(0);
    setDevLog([]);

    log("system", { msg: "Iniciando", file: file.name, size: file.size });

    // Step 1: upload PDF
    setStatus("uploading");
    setMessage("Extrayendo texto del PDF...");

    const uploadForm = new FormData();
    uploadForm.append("file", file);

    let uploadRes;
    try {
      uploadRes = await fetch("/api/translate", { method: "POST", body: uploadForm });
    } catch {
      setStatus("error");
      setError("Error de conexión al subir el PDF");
      return;
    }

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      setStatus("error");
      setError(uploadData.error || "Error al procesar el PDF");
      return;
    }

    const { chunks: receivedChunks, originalText: receivedOriginal } = uploadData;
    setChunks(receivedChunks);
    setOriginalText(receivedOriginal);
    setTotal(receivedChunks.length);
    setMessage(`${receivedChunks.length} bloques detectados. Traduciendo...`);
    log("system", { msg: "PDF procesado", chunks: receivedChunks.length });

    // Step 2: translate chunks one by one
    setStatus("translating");
    let fullTranslation = "";
    let prevText = "";

    for (let i = 0; i < receivedChunks.length; i++) {
      if (abortRef.current) {
        log("system", { msg: "Cancelado por el usuario" });
        return;
      }

      const chunk = receivedChunks[i];
      setCurrent(i + 1);
      setTotal(receivedChunks.length);
      setMessage(`Traduciendo bloque ${i + 1}/${receivedChunks.length}...`);

      const start = Date.now();

      try {
        const res = await fetch("/api/translate/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: chunk.text,
            context: chunk.context,
            previousTranslation: prevText,
            apiKey: apiKey.trim() || undefined,
            sourceLang,
            targetLang,
          }),
        });

        const data = await res.json();
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (!res.ok) {
          log("error", { chunk: i + 1, error: data.error, elapsed: `${elapsed}s` });
          setStatus("error");
          setError(`Error en bloque ${i + 1}: ${data.error}`);
          return;
        }

        setChunkTime((prev) => [...prev, Date.now() - start]);
        fullTranslation += (fullTranslation ? "\n\n" : "") + data.translated;
        prevText = chunk.text;
        setLiveTranslation(fullTranslation);

        log("progress", { chunk: i + 1, elapsed: `${elapsed}s`, textLen: data.translated.length });

        if (resultRef.current) {
          resultRef.current.scrollTop = resultRef.current.scrollHeight;
        }
      } catch {
        log("error", { chunk: i + 1, error: "Error de conexión" });
        setStatus("error");
        setError(`Error de conexión en bloque ${i + 1}`);
        return;
      }
    }

    setStatus("done");
    setMessage("¡Traducción completada!");
    setResult({ original: receivedOriginal, translated: fullTranslation });
    log("system", { msg: "Completado", chunks: receivedChunks.length });
  }, [file, apiKey, sourceLang, targetLang, log]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
    setMessage("");
    setCurrent(0);
    setTotal(0);
    setLiveTranslation("");
    setChunks([]);
    setChunkTime([]);
    log("system", { msg: "Cancelado por el usuario" });
  }, [log]);

  const download = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.translated], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traducido-${file?.name?.replace(/\.[^.]+$/, "") || "documento"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, file]);

  const reset = useCallback(() => {
    setResult(null);
    setLiveTranslation("");
    setOriginalText("");
    setChunks([]);
    setChunkTime([]);
    setFile(null);
    setStatus("idle");
    setMessage("");
    setError("");
    setCurrent(0);
    setTotal(0);
    setDevLog([]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") setFile(dropped);
  }, []);

  const progressPercent = total > 0 ? Math.round((current / total) * 100) : 0;
  const isWorking = status === "uploading" || status === "translating";
  const avgTime = chunkTime.length > 0
    ? Math.round(chunkTime.reduce((a, b) => a + b, 0) / chunkTime.length / 1000)
    : 0;
  const eta = total > 0 && avgTime > 0 && current > 0
    ? ((total - current) * avgTime)
    : null;

  return (
    <div className="min-h-dvh flex flex-col bg-cream-50">
      <header className="border-b border-cream-200 bg-white/60 backdrop-blur-sm px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Babelz" className="h-9 w-auto" />
            <span className="text-[10px] uppercase tracking-widest text-cream-600 bg-cream-200 px-1.5 py-0.5 rounded font-mono">dev</span>
          </div>
          <p className="text-sm text-cream-600">Traductor de PDFs con IA</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-cream-600 cursor-pointer hover:text-stone-700 transition-colors">
          <input
            type="checkbox"
            checked={devMode}
            onChange={(e) => setDevMode(e.target.checked)}
            className="accent-stone-600"
          />
          Dev tools
        </label>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-6">
        {!result && !isWorking && (
          <>
            <section
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-cream-500 bg-cream-100 scale-[1.01]"
                  : "border-cream-300 bg-white/70 hover:bg-cream-100/50 hover:border-cream-400"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="text-5xl mb-3">&#x1F4C4;</div>
              <p className="font-medium text-stone-700">
                {file ? file.name : "Hacé clic o arrastrá un PDF"}
              </p>
              {file && (
                <p className="text-sm text-cream-500 mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">
                  Idioma origen
                </label>
                <select
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full rounded-xl border border-cream-300 bg-white/80 px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                >
                  <option value="auto">Detectar automáticamente</option>
                  <option value="inglés">Inglés</option>
                  <option value="español">Español</option>
                  <option value="francés">Francés</option>
                  <option value="alemán">Alemán</option>
                  <option value="italiano">Italiano</option>
                  <option value="portugués">Portugués</option>
                  <option value="chino">Chino</option>
                  <option value="japonés">Japonés</option>
                  <option value="ruso">Ruso</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">
                  Idioma destino
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full rounded-xl border border-cream-300 bg-white/80 px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                >
                  <option value="español">Español</option>
                  <option value="inglés">Inglés</option>
                  <option value="francés">Francés</option>
                  <option value="alemán">Alemán</option>
                  <option value="italiano">Italiano</option>
                  <option value="portugués">Portugués</option>
                  <option value="chino">Chino</option>
                  <option value="japonés">Japonés</option>
                  <option value="ruso">Ruso</option>
                </select>
              </div>
            </section>

            <section>
                <label className="block text-sm font-medium text-stone-600 mb-1.5">
                  Tu API Key de OpenRouter{" "}
                <span className="text-cream-500 font-normal">(la config del modelo la manejás desde OpenRouter)</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full rounded-xl border border-cream-300 bg-white/80 px-3 py-2.5 text-sm font-mono text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
              />
            </section>

            <button
              onClick={handleSubmit}
              disabled={!file}
              className="w-full rounded-xl bg-stone-700 text-white py-3 text-sm font-semibold hover:bg-stone-800 active:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
            >
              Traducir PDF
            </button>
          </>
        )}

        {isWorking && (
          <section className="space-y-4 bg-white/60 backdrop-blur-sm rounded-xl border border-cream-200 p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-600">{message}</p>
              <button
                onClick={cancel}
                className="text-xs text-blush-dark hover:text-rose-400 underline transition-colors"
              >
                Cancelar
              </button>
            </div>

            {total > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-cream-500 mb-1.5">
                  <span>Bloque {current} de {total}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2.5 bg-cream-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cream-400 to-cream-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {avgTime > 0 && current > 1 && (
                  <div className="flex gap-4 text-xs text-cream-500">
                    <span>Promedio: ~{avgTime}s por bloque</span>
                    {eta !== null && (
                      <span>ETA: ~{Math.ceil(eta / 60)}m {eta % 60}s</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {total === 0 && (
              <div className="flex items-center gap-3 text-sm text-cream-600">
                <span className="inline-block w-4 h-4 border-2 border-cream-400 border-t-transparent rounded-full animate-spin" />
                {message}
              </div>
            )}

            {liveTranslation && (
              <div>
                <h3 className="text-sm font-medium text-stone-600 mb-2">
                  Traducción en vivo <span className="text-cream-500 font-normal">(se actualiza por cada bloque)</span>
                </h3>
                <div
                  ref={resultRef}
                  className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm p-4 rounded-xl bg-white border border-cream-200 text-stone-700 leading-relaxed"
                >
                  {liveTranslation}
                  {status === "translating" && (
                    <span className="inline-block w-[3px] h-4 ml-0.5 bg-stone-500 rounded-sm animate-pulse" />
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {error && (
          <div className="rounded-xl bg-blush border border-blush-dark p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {result && (
          <section className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={download}
                className="rounded-xl bg-stone-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-stone-800 active:bg-stone-600 transition-all shadow-sm hover:shadow-md"
              >
                Descargar traducción (.txt)
              </button>
              <button
                onClick={reset}
                className="rounded-xl border border-cream-300 bg-white/70 px-5 py-2.5 text-sm text-stone-600 hover:bg-cream-100/70 transition-colors"
              >
                Nueva traducción
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-stone-600 mb-2">Original</h3>
                <pre
                  ref={originalRef}
                  onScroll={() => translatedRef.current && originalRef.current && syncScroll(originalRef.current, translatedRef.current)}
                  className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm p-4 rounded-xl bg-white border border-cream-200 text-stone-700 leading-relaxed"
                >
                  {result.original}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-medium text-stone-600 mb-2">Traducción</h3>
                <pre
                  ref={translatedRef}
                  onScroll={() => originalRef.current && translatedRef.current && syncScroll(translatedRef.current, originalRef.current)}
                  className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm p-4 rounded-xl bg-white border border-cream-200 text-stone-700 leading-relaxed"
                >
                  {result.translated}
                </pre>
              </div>
            </div>
          </section>
        )}

        {devMode && (
          <section className="border-t border-cream-200 pt-4">
            <details open>
              <summary className="text-xs font-mono text-cream-500 cursor-pointer select-none mb-2 hover:text-stone-600 transition-colors">
                Event log ({devLog.length} eventos)
              </summary>
              <div
                ref={logRef}
                className="max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed bg-stone-800 text-stone-200 rounded-xl p-4"
              >
                {devLog.length === 0 && (
                  <span className="text-stone-400">Esperando eventos...</span>
                )}
                {devLog.map((entry, i) => (
                  <div key={i} className="border-b border-stone-700/50 pb-1 mb-1 last:border-0">
                    <span className="text-stone-400">[{entry.ts}]</span>{" "}
                    <span className={
                      entry.event === "error" ? "text-rose-300" :
                      entry.event === "done" ? "text-sky-dark" :
                      entry.event === "system" ? "text-sky-dark" :
                      entry.event === "progress" ? "text-stone-300" :
                      "text-stone-100"
                    }>
                      {entry.event}
                    </span>
                    {" "}
                    <span className="text-stone-400">{entry.data}</span>
                  </div>
                ))}
                {status === "translating" && (
                  <span className="inline-block w-2 h-3 bg-stone-400 animate-pulse ml-1 rounded" />
                )}
              </div>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}