# Run in Windows PowerShell 5.1 with -STA after npm run build.
# Save/materialize the user's clipboard before the isolated native integration test.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$selectionSource = Get-Content -LiteralPath (Join-Path $projectRoot 'src/native/selection.ps1') -Raw
Invoke-Expression $selectionSource.Substring(0, $selectionSource.LastIndexOf('try {'))
$snapshotMethod = [SelectionCapture].GetMethod('Snapshot', [System.Reflection.BindingFlags]'Static,NonPublic')
$savedClipboard = $snapshotMethod.Invoke($null, @())
$testToken = 'MMTranslator-native-test-' + [Guid]::NewGuid().ToString()
$exitCode = 1
try {
    $env:ELECTRON_RUN_AS_NODE = $null
    & node (Join-Path $projectRoot 'node_modules/electron/cli.js') (Join-Path $PSScriptRoot 'test-selection-native.js') $testToken
    $exitCode = $LASTEXITCODE
} finally {
    # Never replace clipboard data copied by the user during the test.
    if ([System.Windows.Forms.Clipboard]::GetText().StartsWith($testToken)) {
        if ($savedClipboard.GetFormats($false).Length -eq 0) { [System.Windows.Forms.Clipboard]::Clear() }
        else { [System.Windows.Forms.Clipboard]::SetDataObject($savedClipboard, $true, 0, 0) }
    }
}
exit $exitCode
