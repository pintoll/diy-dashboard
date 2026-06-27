export const GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = { candidates?: GeminiCandidate[] };

type GenerationConfig = {
  responseMimeType?: string;
  temperature?: number;
};

type GeminiRequestBody = {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: GenerationConfig;
};

export async function geminiGenerate(opts: {
  apiKey: string;
  system?: string;
  user: string;
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const { apiKey, system, user, json, temperature } = opts;

  const generationConfig: GenerationConfig = {};
  if (json) {
    generationConfig.responseMimeType = "application/json";
  }
  if (temperature !== undefined) {
    generationConfig.temperature = temperature;
  }

  const body: GeminiRequestBody = {
    contents: [{ role: "user", parts: [{ text: user }] }],
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
