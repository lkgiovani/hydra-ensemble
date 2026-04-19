import type { Extension } from '@codemirror/state'

/**
 * Map a file path's extension to a CodeMirror language extension. Languages
 * are loaded lazily via dynamic import so the bundle stays small for users
 * who never open the editor.
 */
export async function loadLanguageFor(path: string): Promise<Extension | null> {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs': {
      const mod = await import('@codemirror/lang-javascript')
      return mod.javascript({ jsx: ext === 'jsx' })
    }
    case 'ts':
    case 'tsx': {
      const mod = await import('@codemirror/lang-javascript')
      return mod.javascript({ typescript: true, jsx: ext === 'tsx' })
    }
    case 'rs': {
      const mod = await import('@codemirror/lang-rust')
      return mod.rust()
    }
    case 'go': {
      const mod = await import('@codemirror/lang-go')
      return mod.go()
    }
    case 'py': {
      const mod = await import('@codemirror/lang-python')
      return mod.python()
    }
    case 'md':
    case 'markdown': {
      const mod = await import('@codemirror/lang-markdown')
      return mod.markdown()
    }
    default:
      return null
  }
}
