declare module '#pdfjs-sandbox' {
  /** The parts of PDF.js's `SandboxSupport` the bridge touches. */
  export interface PdfjsSandboxSupport {
    /** Used at call time for alert, confirm, prompt, timers, console, URL and events. */
    win: unknown
  }

  export interface PdfjsSandbox {
    support: PdfjsSandboxSupport | null
    /** The QuickJS module; `stringToNewUTF8` copies the scripting source into the engine. */
    _module: { stringToNewUTF8(source: string): number } | null
    create(data: unknown): void
    /** Runs synchronously: every `send` the scripts make happens before it returns. */
    dispatchEvent(event: unknown): void
    nukeSandbox(): void
  }

  /** Loads `${wasmUrl}quickjs-eval.js` and its wasm, and hands the sandbox the global `window`. */
  export function QuickJSSandbox(wasmUrl?: string): Promise<PdfjsSandbox>
}
