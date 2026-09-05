/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Яндекс.Метрика counter id. Empty/unset = analytics never loads. */
  readonly VITE_METRIKA_ID?: string;
  /** "1" enables Webvisor session replay (off by default — privacy). */
  readonly VITE_METRIKA_WEBVISOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
