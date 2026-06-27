/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_FRED_API_KEY?: string;
  readonly MAIN_VITE_FMP_API_KEY?: string;
  readonly MAIN_VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
