import { shell, app } from 'electron'
import { existsSync } from 'node:fs'

/** Opens a folder in the OS file explorer. */
export async function openFolderPath(path: string): Promise<void> {
  if (!path || !existsSync(path)) {
    throw new Error('Folder does not exist')
  }
  const error = await shell.openPath(path)
  if (error) {
    throw new Error(`Unable to open folder: ${error}`)
  }
}

/** Restarts the application cleanly (used after restore). */
export function restartApp(): void {
  app.relaunch()
  app.exit(0)
}