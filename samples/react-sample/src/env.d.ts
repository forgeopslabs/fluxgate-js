interface ImportMetaEnv {
  readonly FLUXGATE_WEB_BASE_URL?: string;
  readonly FLUXGATE_WEB_SDK_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
