<#
.SYNOPSIS
  Register the Utopia TMS sync agent to start at logon.

.DESCRIPTION
  Creates a scheduled task in the CURRENT USER's context, triggered at logon.

  Not a Windows Service, and not a machine-wide task running as SYSTEM. Both
  fail the same way: Session 0 isolation prevents them from attaching to the
  interactive Outlook instance, so the agent starts cleanly and then finds no
  mailbox. It must run as the person whose mail it reads -- which also scopes
  each agent to exactly one mailbox without any extra work.

  No administrator rights are required, precisely because the task is
  per-user.

.EXAMPLE
  .\Install-Agent.ps1 -PairingCode ABCD1234
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $PairingCode,
  [string] $ApiBaseUrl = 'https://utopia-tms.vercel.app',
  [string] $ProtectionBypass = '',
  [string] $TaskName = 'Utopia TMS Sync Agent'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$agentScript = Join-Path $PSScriptRoot 'UtopiaTmsAgent.ps1'
$configPath = Join-Path $PSScriptRoot 'agent.config.json'

if (-not (Test-Path $agentScript)) {
  throw "UtopiaTmsAgent.ps1 not found beside this installer."
}

# ---- Config ----------------------------------------------------------
$config = if (Test-Path $configPath) {
  Get-Content $configPath -Raw -Encoding utf8 | ConvertFrom-Json
} else {
  Get-Content (Join-Path $PSScriptRoot 'agent.config.example.json') -Raw -Encoding utf8 | ConvertFrom-Json
}

$config.apiBaseUrl = $ApiBaseUrl
$config.pairingCode = $PairingCode.ToUpper()
if ($ProtectionBypass) { $config.protectionBypass = $ProtectionBypass }

$config | ConvertTo-Json -Depth 6 | Set-Content -Path $configPath -Encoding utf8
Write-Host "Config written to $configPath"

# ---- Verify before scheduling ---------------------------------------
# Enrol and run one real cycle now. Scheduling a task that has never
# succeeded means the first sign of a bad pairing code is silence at the
# next logon.
Write-Host "`nRunning one cycle to enrol and verify..." -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentScript -ConfigPath $configPath -Once
if ($LASTEXITCODE -ne 0) {
  throw "The verification run failed. The task was NOT scheduled -- fix the error above and re-run."
}

# ---- Schedule --------------------------------------------------------
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agentScript`" -ConfigPath `"$configPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -RestartCount 3 `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

# Interactive, not S4U or a stored password: the agent needs the desktop
# session Outlook lives in.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "`nInstalled." -ForegroundColor Green
Write-Host "  Task:   $TaskName (starts at your logon)"
Write-Host "  Logs:   $env:LOCALAPPDATA\UtopiaTMS\Agent\logs"
Write-Host "`nStart it now with:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remove it with:     Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
