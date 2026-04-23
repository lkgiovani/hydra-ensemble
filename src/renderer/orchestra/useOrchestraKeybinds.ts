import { useEffect } from 'react'

export const ORCHESTRA_EVENTS = {
  help: 'orchestra:help-toggle',
  search: 'orchestra:search-toggle',
  settings: 'orchestra:settings-toggle',
  newTask: 'orchestra:new-task',
  newAgentWizard: 'orchestra:new-agent-wizard',
  healthToggle: 'orchestra:health-toggle',
  closeTop: 'orchestra:close-top'
} as const

export type OrchestraEventName = typeof ORCHESTRA_EVENTS[keyof typeof ORCHESTRA_EVENTS]

function fire(name: OrchestraEventName, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

function hasOpenModal(): boolean {
  if (typeof document === 'undefined') return false
  return document.querySelector('[role="dialog"], [data-modal="open"]') !== null
}

export function useOrchestraKeybinds(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return

      const mod = e.metaKey || e.ctrlKey

      // Cmd/Ctrl + Shift + K -> AgentWizard
      if (mod && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        fire(ORCHESTRA_EVENTS.newAgentWizard)
        e.preventDefault()
        return
      }

      // Cmd/Ctrl + Shift + N -> NewTaskDialog
      if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        fire(ORCHESTRA_EVENTS.newTask)
        e.preventDefault()
        return
      }

      // Cmd/Ctrl + P -> search
      if (mod && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        fire(ORCHESTRA_EVENTS.search)
        e.preventDefault()
        return
      }

      // Cmd/Ctrl + , -> settings
      if (mod && !e.shiftKey && !e.altKey && e.key === ',') {
        fire(ORCHESTRA_EVENTS.settings)
        e.preventDefault()
        return
      }

      // Cmd/Ctrl + B -> team health panel
      if (mod && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        fire(ORCHESTRA_EVENTS.healthToggle)
        e.preventDefault()
        return
      }

      // ? -> help (no modifiers, not typing)
      if (!mod && !e.altKey && e.key === '?') {
        fire(ORCHESTRA_EVENTS.help)
        e.preventDefault()
        return
      }

      // Esc -> close top overlay (only when no modal/input is in the way)
      if (e.key === 'Escape' && !mod && !e.shiftKey && !e.altKey) {
        if (hasOpenModal()) return
        fire(ORCHESTRA_EVENTS.closeTop)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}

export function onOrchestraEvent(
  name: OrchestraEventName,
  handler: () => void
): () => void {
  const listener = (): void => handler()
  window.addEventListener(name, listener)
  return () => {
    window.removeEventListener(name, listener)
  }
}
