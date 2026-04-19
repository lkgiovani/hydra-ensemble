import { Notification } from 'electron'
import type { NotificationKind, NotifyOptions } from '../../shared/types'

/**
 * Thin wrapper over Electron's Notification API. Adds a small
 * kind-aware title prefix so the user can tell at a glance whether
 * the alert is informational, needs attention, etc. Errors from the
 * platform notification daemon (e.g. no daemon running on Linux) are
 * swallowed silently.
 */
export class NotificationService {
  show(opts: NotifyOptions): void {
    try {
      if (!Notification.isSupported()) return
      const title = decorateTitle(opts.title, opts.kind)
      const notif = new Notification({
        title,
        body: opts.body,
        silent: opts.kind === 'info'
      })
      notif.on('failed', () => {
        // No daemon / quota exceeded / etc. — silent on purpose.
      })
      notif.show()
    } catch {
      // Linux without a notification daemon throws synchronously on some
      // distributions; we deliberately swallow rather than crash.
    }
  }
}

function decorateTitle(title: string, kind: NotificationKind | undefined): string {
  switch (kind) {
    case 'attention':
      return `! ${title}`
    case 'completed':
      return `\u2713 ${title}`
    case 'error':
      return `\u2716 ${title}`
    case 'info':
    case undefined:
    default:
      return title
  }
}
