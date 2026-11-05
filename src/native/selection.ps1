$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class SelectionCapture {
    public static string Failure = "";
    static string Fail(string reason) { Failure = reason; return ""; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
    [StructLayout(LayoutKind.Explicit)] struct UNION {
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {
        public ushort key, scan; public uint flags, time; public UIntPtr extra;
    }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {
        public int x, y; public uint data, flags, time; public UIntPtr extra;
    }
    static INPUT Key(ushort key, bool up) {
        return new INPUT { type = 1, data = new UNION { keyboard = new KEYBDINPUT { key = key, flags = up ? 2u : 0u } } };
    }
    static bool KeysHeld() {
        foreach (int key in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0x43 })
            if ((GetAsyncKeyState(key) & 0x8000) != 0) return true;
        return false;
    }
    static uint ProcessOf(IntPtr window) {
        uint process; GetWindowThreadProcessId(window, out process); return process;
    }
    static DataObject Snapshot() {
        var source = Clipboard.GetDataObject();
        var saved = new DataObject();
        if (source == null) return saved;
        // Materialize before copying: an IDataObject alone may be lazily backed by the old owner.
        foreach (string format in source.GetFormats(false)) {
            object value = source.GetData(format, false);
            if (value is MemoryStream) value = new MemoryStream(((MemoryStream)value).ToArray());
            else if (value is Image) value = ((Image)value).Clone();
            else if (value is string[]) value = ((string[])value).Clone();
            else if (!(value is string) && !(value is byte[]) && !(value is System.Collections.Specialized.StringCollection))
                throw new InvalidOperationException("Clipboard format cannot be preserved");
            saved.SetData(format, false, value);
        }
        return saved;
    }
    public static string Capture() {
        IntPtr foreground = GetForegroundWindow();
        uint process = ProcessOf(foreground);
        if (foreground == IntPtr.Zero || process == 0) return Fail("no-foreground");
        for (int i = 0; i < 60 && KeysHeld(); i++) Thread.Sleep(20);
        if (KeysHeld()) return Fail("keys-held");
        if (GetForegroundWindow() != foreground) return Fail("foreground-changed");
        uint before = GetClipboardSequenceNumber();
        DataObject saved = Snapshot();
        if (GetClipboardSequenceNumber() != before) return Fail("clipboard-changed-during-snapshot");
        if (GetForegroundWindow() != foreground) return Fail("foreground-changed");
        uint copied = before;
        try {
            var inputs = new INPUT[] { Key(0x11, false), Key(0x43, false), Key(0x43, true), Key(0x11, true) };
            uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
            if (sent != inputs.Length) {
                // Release any keys that a partial SendInput may have left down.
                var releases = new INPUT[] { Key(0x43, true), Key(0x11, true) };
                SendInput(2, releases, Marshal.SizeOf(typeof(INPUT)));
                return Fail("copy-input-failed");
            }
            for (int i = 0; i < 50; i++) {
                Thread.Sleep(20);
                if (GetForegroundWindow() != foreground) return Fail("foreground-changed");
                uint current = GetClipboardSequenceNumber();
                if (current == before) continue;
                // An unrelated clipboard writer must never be translated or overwritten.
                if (ProcessOf(GetClipboardOwner()) != process) return Fail("foreign-clipboard-writer");
                copied = current;
                try {
                    string text = Clipboard.GetText(TextDataFormat.UnicodeText);
                    if (GetClipboardSequenceNumber() != copied) { copied = before; return Fail("clipboard-changed-during-read"); }
                    return text;
                } catch (ExternalException) { /* Owner may still be rendering clipboard data. */ }
            }
            return Fail("no-new-text");
        } finally {
            if (copied != before && GetClipboardSequenceNumber() == copied && ProcessOf(GetClipboardOwner()) == process) {
                // No retry: a delayed retry could overwrite a subsequent user copy.
                try {
                    if (saved.GetFormats(false).Length == 0) Clipboard.Clear();
                    else Clipboard.SetDataObject(saved, true, 0, 0);
                } catch (ExternalException) { /* Preserve the current clipboard if it is busy. */ }
            }
        }
    }
}
'@
try {
    $selectedText = [SelectionCapture]::Capture()
    @{ text = $selectedText; reason = [SelectionCapture]::Failure } | ConvertTo-Json -Compress
} catch {
    @{ text = ''; reason = 'clipboard-unavailable' } | ConvertTo-Json -Compress
}
