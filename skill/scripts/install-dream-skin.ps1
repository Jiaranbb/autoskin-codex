[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts,
  [switch]$NoAutoRecover
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$LegacyStateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexAutoSkin'
if (-not (Test-Path -LiteralPath $StateRoot) -and (Test-Path -LiteralPath $LegacyStateRoot)) {
  New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
  foreach ($entry in @('runtime', 'themes-private', 'install-state.json', 'config.before-dream-skin.toml', 'state.json', 'paused')) {
    $sourceEntry = Join-Path $LegacyStateRoot $entry
    if (Test-Path -LiteralPath $sourceEntry) { Copy-Item -LiteralPath $sourceEntry -Destination $StateRoot -Recurse }
  }
}
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$ConfigPath = Join-Path $HOME '.codex\config.toml'
$BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
if (-not (Test-Path -LiteralPath $BackupPath)) { Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath }

# Runtime bootstrap only snapshots the current official appearance. A concrete
# schema-v2 theme applies its own nativeTheme transactionally later.

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe).Source
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex Dream Skin.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port -RestartExisting"
    $shortcut.WorkingDirectory = $SkillRoot
    $shortcut.Description = 'Launch Codex with the Dream Skin theme engine'
    $shortcut.Save()
  }
  $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Dream Skin - Restore.lnk'))
  $restore.TargetPath = $powershell
  $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port"
  $restore.WorkingDirectory = $SkillRoot
  $restore.Description = 'Remove the live Codex Dream Skin'
  $restore.Save()
}

if (-not $NoAutoRecover) {
  $shell = New-Object -ComObject WScript.Shell
  $powershell = (Get-Command powershell.exe).Source
  $startup = [Environment]::GetFolderPath('Startup')
  $watchScript = Join-Path $PSScriptRoot 'watch-dream-skin.ps1'
  $watcherShortcutPath = Join-Path $startup 'Codex Dream Skin Watcher.lnk'
  $watcherShortcut = $shell.CreateShortcut($watcherShortcutPath)
  $watcherShortcut.TargetPath = $powershell
  $watcherShortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchScript`" -Port $Port"
  $watcherShortcut.WorkingDirectory = $SkillRoot
  $watcherShortcut.Description = 'Automatically restore Codex Dream Skin after a normal Codex restart'
  $watcherShortcut.Save()

  $watcherStatePath = Join-Path $StateRoot 'watcher-state.json'
  if (Test-Path -LiteralPath $watcherStatePath) {
    try {
      $watcherState = Get-Content -LiteralPath $watcherStatePath -Raw | ConvertFrom-Json
      if ($watcherState.watcherPid) { Stop-Process -Id ([int]$watcherState.watcherPid) -Force -ErrorAction SilentlyContinue }
    } catch {}
    Remove-Item -LiteralPath $watcherStatePath -Force -ErrorAction SilentlyContinue
  }
  Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$watchScript`"", '-Port', "$Port"
  )
}

Write-Host 'Codex Dream Skin installed. Normal Codex restarts will now recover the skin automatically.'
