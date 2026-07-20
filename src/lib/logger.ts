/**
 * Simple logging utility for the frontend
 *
 * In development: logs to browser console
 * In production: warn/error forward to the Tauri log plugin
 * (stdout + the on-disk log file), so failures stay diagnosable
 */

import {
  warn as backendWarn,
  error as backendError,
} from '@tauri-apps/plugin-log'

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  context?: Record<string, unknown>
}

class Logger {
  private isDevelopment = import.meta.env.DEV

  /**
   * Log a trace message (most verbose)
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context)
  }

  /**
   * Log a debug message (development only)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
    }

    // Always log to console in development
    if (this.isDevelopment) {
      this.logToConsole(entry)
      return
    }

    // Production: warn/error must survive somewhere inspectable —
    // the Tauri log plugin writes them to stdout and the log file.
    if (level === 'warn' || level === 'error') {
      this.logToBackend(entry)
    }
  }

  /**
   * Forward to the Tauri log plugin. Call sites must never pass secret
   * material — the message and context land in the on-disk log.
   */
  private logToBackend(entry: LogEntry): void {
    let message = entry.message
    if (entry.context) {
      try {
        message += ` ${JSON.stringify(entry.context, (_key, value: unknown) =>
          value instanceof Error ? value.message : value
        )}`
      } catch {
        message += ' [context unserializable]'
      }
    }
    const sink = entry.level === 'error' ? backendError : backendWarn
    void sink(message).catch(() => {
      // The plugin IS the last-resort sink — nothing left to fall back to.
    })
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`

    const args = entry.context
      ? [prefix, entry.message, entry.context]
      : [prefix, entry.message]

    switch (entry.level) {
      case 'trace':
      case 'debug':
        console.debug(...args)
        break
      case 'info':
        console.info(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'error':
        console.error(...args)
        break
    }
  }
}

// Export a singleton logger instance
export const logger = new Logger()
