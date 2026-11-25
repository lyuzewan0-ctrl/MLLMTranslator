import { app } from "electron"
import fs from "node:fs"
import path from "node:path"

const AUTOSTART_FILENAME = "ai.opencode.screenshot-translator.desktop"

function quoteDesktopArgument(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/%/g, "%%")
  return `"${escaped}"`
}

function launchArguments(): string[] {
  if (app.isPackaged) {
    // process.execPath points inside a temporary mount for AppImage builds.
    // APPIMAGE contains the persistent path selected by the user.
    const appImagePath = process.env.APPIMAGE
    return [appImagePath ? path.resolve(appImagePath) : process.execPath]
  }
  return [process.execPath, app.getAppPath()]
}

function desktopEntry(): string {
  const command = launchArguments().map(quoteDesktopArgument).join(" ")
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=Screenshot Translator",
    "Comment=Start Screenshot Translator in the system tray",
    `Exec=${command}`,
    "Terminal=false",
    "StartupNotify=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n")
}

export async function syncLinuxAutoStart(enabled: boolean): Promise<void> {
  if (process.platform !== "linux") return

  const directory = path.join(app.getPath("appData"), "autostart")
  const file = path.join(directory, AUTOSTART_FILENAME)

  if (!enabled) {
    try {
      await fs.promises.unlink(file)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    return
  }

  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 })
  const temporaryFile = `${file}.${process.pid}.tmp`
  try {
    await fs.promises.writeFile(temporaryFile, desktopEntry(), {
      encoding: "utf-8",
      mode: 0o644,
    })
    await fs.promises.rename(temporaryFile, file)
  } catch (error: unknown) {
    await fs.promises.unlink(temporaryFile).catch(() => undefined)
    throw error
  }
}
