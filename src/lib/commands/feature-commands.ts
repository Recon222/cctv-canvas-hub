/**
 * Feature Commands - Commands registered by feature modules
 *
 * When adding a new feature that exposes commands to the command palette,
 * add them here. Each feature's commands should use the feature name as
 * the group and reference i18n keys for labels. Feature code is imported
 * LAZILY inside execute (template pattern) — the registry stays cheap to
 * load and features stay out of the command system's module graph.
 */

import { FolderOpen, LayoutDashboard, Map, Lock, LogOut } from 'lucide-react'
import i18n from '@/i18n/config'
import type { AppCommand, CommandContext } from './types'
import type { CanvassView } from '@/features/canvass'

/**
 * The palette mirrors the A1 nav rail (AD12: Cases → Case dashboard →
 * Map — per-view go-to commands; "toggle" is undefined over a
 * three-view rail). Case-bound views guard on a selected case exactly
 * like the rail's disabled entries — a toast, never a broken view.
 */
async function goToCanvassView(
  view: CanvassView,
  context: CommandContext
): Promise<void> {
  const { useCanvassStore } = await import('@/features/canvass')
  const store = useCanvassStore.getState()
  if (view !== 'cases' && store.selectedCaseId === null) {
    context.showToast(i18n.t('canvass.nav.needsCase'), 'info')
    return
  }
  store.setView(view)
}

export const featureCommands: AppCommand[] = [
  {
    id: 'canvass-view-cases',
    labelKey: 'commands.canvassViewCases.label',
    descriptionKey: 'commands.canvassViewCases.description',
    icon: FolderOpen,
    group: 'canvass',
    keywords: ['cases', 'landing', 'board', 'view'],
    execute: context => goToCanvassView('cases', context),
  },
  {
    id: 'canvass-view-case',
    labelKey: 'commands.canvassViewCase.label',
    descriptionKey: 'commands.canvassViewCase.description',
    icon: LayoutDashboard,
    group: 'canvass',
    keywords: ['case', 'dashboard', 'roster', 'view'],
    execute: context => goToCanvassView('case', context),
  },
  {
    id: 'canvass-view-map',
    labelKey: 'commands.canvassViewMap.label',
    descriptionKey: 'commands.canvassViewMap.description',
    icon: Map,
    group: 'canvass',
    keywords: ['map', 'markers', 'view'],
    execute: context => goToCanvassView('map', context),
  },
  // session-lock-now ships WITH its unlock overlay (6.1C) — moved out
  // of 5.3 so no build ever had a lock without an escape.
  {
    id: 'session-lock-now',
    labelKey: 'commands.sessionLockNow.label',
    descriptionKey: 'commands.sessionLockNow.description',
    icon: Lock,
    group: 'session',
    keywords: ['lock', 'idle', 'kiosk', 'session', 'secure'],
    execute: async () => {
      const { useSessionStore } = await import('@/features/cloud-session')
      // Self-guarding: lock() is active → locked only.
      useSessionStore.getState().lock()
    },
  },
  {
    id: 'session-sign-out',
    labelKey: 'commands.sessionSignOut.label',
    descriptionKey: 'commands.sessionSignOut.description',
    icon: LogOut,
    group: 'session',
    keywords: ['sign out', 'logout', 'log out', 'session', 'end'],
    execute: async () => {
      const { signOut, useSessionStore } =
        await import('@/features/cloud-session')
      // Same pair as SignOutButton: end the cloud session, then move
      // the machine. Failures bubble to the registry's catch → toast.
      await signOut()
      useSessionStore.getState().setState('signed-out')
    },
  },
]
