import { execFile } from "node:child_process"
import path from "node:path"

/** Copy before focusing the overlay. The helper verifies a fresh clipboard write. */
export async function captureSelectedText(): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("当前平台暂不支持自动取词，请复制文字后粘贴到原文框")
  }
  const script = path.join(__dirname, "..", "native", "selection.ps1")
    .replace(/app\.asar([\\/])/, "app.asar.unpacked$1")
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  return new Promise((resolve, reject) => {
    execFile(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", script], {
      windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, encoding: "utf8",
    }, (error, stdout) => {
      const fail = () => reject(new Error("未获取到选中文字，请重新选择后按快捷键，或手动粘贴原文"))
      if (error) { fail(); return }
      try {
        const result = JSON.parse(stdout.replace(/^\uFEFF/, "").trim()) as { text?: unknown; reason?: unknown }
        if (typeof result.text !== "string" || !result.text.trim()) {
          console.warn("[selection] no text:", typeof result.reason === "string" ? result.reason : "unknown")
          fail(); return
        }
        resolve(result.text)
      } catch { fail() }
    })
  })
}
