import { Editor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

// Bundle Monaco and its workers locally so nothing is fetched from a CDN
// (Electron runs offline and under a strict CSP).
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  }
}
loader.config({ monaco })

export function CodeEditor({
  value,
  onChange,
  language,
  height = '100%',
  readOnly = false
}: {
  value: string
  onChange?: (value: string) => void
  language: 'json' | 'sql' | 'plaintext'
  height?: number | string
  readOnly?: boolean
}): JSX.Element {
  return (
    <Editor
      height={height}
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange?.(v ?? '')}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on'
      }}
    />
  )
}
