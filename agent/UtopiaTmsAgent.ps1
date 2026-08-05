<#
.SYNOPSIS
  Utopia TMS Outlook sync agent.

.DESCRIPTION
  Reads container-related mail from the Outlook Desktop profile of the user it
  runs as, and pushes the extracted fields to the TMS API over HTTPS.

  Why this exists at all: a browser cannot reach Outlook, and a Vercel
  function has no Windows desktop session. Outlook COM automation requires
  both, so the only workable shape is a small process running in the
  operator's own session. See CLAUDE.md section 10.

  MUST run as a user-session process, never as a Windows Service. Session 0
  isolation prevents a service from attaching to the interactive Outlook
  instance -- it will appear to start and then find no mailbox. Install-Agent.ps1
  registers it as a scheduled task at logon, which is correct.

  Mailbox scoping is a consequence of that, not extra work: the agent sees
  only the profile of the user it runs as.

.PARAMETER Mock
  Use the built-in fixture mailbox instead of Outlook. Lets the whole
  pipeline -- enrolment, batching, retry, watermark -- be exercised on a machine
  with no Office installed.

.PARAMETER Once
  Run a single cycle and exit, instead of looping. Used by the installer to
  verify a fresh enrolment.

.EXAMPLE
  .\UtopiaTmsAgent.ps1 -Mock -Once
#>
[CmdletBinding()]
param(
  [string] $ConfigPath = "$PSScriptRoot\agent.config.json",
  [switch] $Mock,
  [switch] $Once
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------------
# State lives beside the user's profile, not next to the script: the
# script directory may be read-only when deployed via Intune or GPO.
# ------------------------------------------------------------------
$script:StateDir = Join-Path $env:LOCALAPPDATA 'UtopiaTMS\Agent'
$script:LogDir = Join-Path $script:StateDir 'logs'
$script:TokenPath = Join-Path $script:StateDir 'device.token'
$script:StatePath = Join-Path $script:StateDir 'state.json'
$script:QueuePath = Join-Path $script:StateDir 'outbox.json'

foreach ($dir in @($script:StateDir, $script:LogDir)) {
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

function Write-AgentLog {
  param(
    [Parameter(Mandatory)] [ValidateSet('INFO', 'WARN', 'ERROR')] [string] $Level,
    [Parameter(Mandatory)] [string] $Message
  )
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "$stamp [$Level] $Message"
  Write-Host $line

  # One file per day, pruned after 14. An agent that fills a laptop's disk
  # with its own logs is worse than one that stops.
  $file = Join-Path $script:LogDir ("agent-{0}.log" -f (Get-Date).ToString('yyyy-MM-dd'))
  Add-Content -Path $file -Value $line -Encoding utf8
  Get-ChildItem $script:LogDir -Filter 'agent-*.log' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 14 |
    ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
}

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
function Get-AgentConfig {
  param([string] $Path)

  if (-not (Test-Path $Path)) {
    throw "Config not found at $Path. Copy agent.config.example.json and fill it in."
  }

  $cfg = Get-Content $Path -Raw -Encoding utf8 | ConvertFrom-Json

  foreach ($required in @('apiBaseUrl')) {
    if (-not $cfg.PSObject.Properties.Name.Contains($required) -or -not $cfg.$required) {
      throw "Config is missing '$required'."
    }
  }

  if ($cfg.apiBaseUrl -notmatch '^https://' -and $cfg.apiBaseUrl -notmatch '^http://localhost') {
    # A device token in flight over plain HTTP is a credential in the clear.
    throw "apiBaseUrl must use HTTPS (localhost excepted for development)."
  }

  $defaults = @{
    folders           = @('Inbox')
    pollSeconds       = 30
    batchSize         = 50
    lookbackDays      = 7
    maxBodyChars      = 20000
    subjectMustMatch  = ''
  }
  foreach ($key in $defaults.Keys) {
    if (-not $cfg.PSObject.Properties.Name.Contains($key)) {
      $cfg | Add-Member -NotePropertyName $key -NotePropertyValue $defaults[$key]
    }
  }

  return $cfg
}

# ------------------------------------------------------------------
# Persistent state -- watermark per folder, so a restart resumes rather
# than re-reading the mailbox from the beginning.
# ------------------------------------------------------------------
function Get-AgentState {
  if (Test-Path $script:StatePath) {
    try { return Get-Content $script:StatePath -Raw -Encoding utf8 | ConvertFrom-Json }
    catch { Write-AgentLog WARN "State file unreadable, starting fresh: $($_.Exception.Message)" }
  }
  return [pscustomobject]@{ watermarks = [pscustomobject]@{} }
}

function Save-AgentState {
  param($State)
  $State | ConvertTo-Json -Depth 5 | Set-Content -Path $script:StatePath -Encoding utf8
}

function Get-Watermark {
  param($State, [string] $Folder, [int] $LookbackDays)
  $props = $State.watermarks.PSObject.Properties
  if ($props.Name -contains $Folder) {
    return [datetime]::Parse($State.watermarks.$Folder)
  }
  return (Get-Date).AddDays(-$LookbackDays)
}

function Set-Watermark {
  param($State, [string] $Folder, [datetime] $Value)
  if ($State.watermarks.PSObject.Properties.Name -contains $Folder) {
    $State.watermarks.$Folder = $Value.ToString('o')
  } else {
    $State.watermarks | Add-Member -NotePropertyName $Folder -NotePropertyValue $Value.ToString('o')
  }
}

# ------------------------------------------------------------------
# Mail providers
#
# The seam doc 05 asks for. Read-Mail returns the same shape from either
# source, so everything downstream is identical whether the mail came from
# Outlook or a fixture.
# ------------------------------------------------------------------
function Read-MailFromOutlook {
  param($Config, $State)

  $messages = @()
  $outlook = $null

  try {
    # Attaches to the running instance if there is one. Outlook must be open
    # and signed in; the agent deliberately does not start it, because a
    # process it launched could sit behind a profile-password prompt no one
    # can see.
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace('MAPI')
  } catch {
    throw "Cannot reach Outlook. Is it installed, running and signed in? $($_.Exception.Message)"
  }

  foreach ($folderName in $Config.folders) {
    $since = Get-Watermark -State $State -Folder $folderName -LookbackDays $Config.lookbackDays
    $folder = $null

    try {
      $folder = if ($folderName -eq 'Inbox') {
        $namespace.GetDefaultFolder(6)   # olFolderInbox
      } elseif ($folderName -eq 'SentMail') {
        $namespace.GetDefaultFolder(5)   # olFolderSentMail
      } else {
        $namespace.GetDefaultFolder(6).Folders.Item($folderName)
      }
    } catch {
      Write-AgentLog WARN "Folder '$folderName' not found, skipping."
      continue
    }

    # Restrict server-side rather than walking every item. The DASL date
    # format is culture-invariant on purpose: a locale-formatted date here
    # silently returns nothing on a machine with non-US regional settings.
    $filter = "@SQL=%today(""urn:schemas:httpmail:datereceived"")% OR " +
              """urn:schemas:httpmail:datereceived"" > '" + $since.ToString('yyyy-MM-dd HH:mm') + "'"

    $items = $null
    try {
      $items = $folder.Items.Restrict($filter)
      $items.Sort('[ReceivedTime]', $true)
    } catch {
      Write-AgentLog WARN "Restrict failed on '$folderName', falling back to full scan."
      $items = $folder.Items
      $items.Sort('[ReceivedTime]', $true)
    }

    $newest = $since
    $count = 0

    foreach ($item in $items) {
      if ($count -ge $Config.batchSize) { break }
      # MailItem only. Meeting requests and reports have no Body/SenderName.
      if ($item.Class -ne 43) { continue }
      if ($item.ReceivedTime -le $since) { continue }

      if ($Config.subjectMustMatch -and $item.Subject -notmatch $Config.subjectMustMatch) {
        continue
      }

      $messageId = $null
      try {
        # PR_INTERNET_MESSAGE_ID. Stable and globally unique, unlike EntryID
        # which changes when an item moves store or folder.
        $messageId = $item.PropertyAccessor.GetProperty(
          'http://schemas.microsoft.com/mapi/proptag/0x1035001F')
      } catch { }

      if (-not $messageId) {
        Write-AgentLog WARN "Skipping an item with no Internet Message-Id: '$($item.Subject)'"
        continue
      }

      $attachments = @()
      try {
        foreach ($a in $item.Attachments) {
          $attachments += @{
            fileName  = $a.FileName
            sizeBytes = $a.Size
          }
        }
      } catch { }

      $body = if ($item.Body) { $item.Body } else { '' }
      if ($body.Length -gt $Config.maxBodyChars) {
        $body = $body.Substring(0, $Config.maxBodyChars)
      }

      $messages += @{
        internetMessageId = [string]$messageId
        conversationId    = [string]$item.ConversationID
        entryId           = [string]$item.EntryID
        folder            = $folderName
        subject           = [string]$item.Subject
        senderName        = [string]$item.SenderName
        senderAddress     = [string]$item.SenderEmailAddress
        receivedAt        = $item.ReceivedTime.ToUniversalTime().ToString('o')
        body              = $body
        attachments       = $attachments
      }

      if ($item.ReceivedTime -gt $newest) { $newest = $item.ReceivedTime }
      $count++
    }

    if ($count -gt 0) {
      Set-Watermark -State $State -Folder $folderName -Value $newest
      Write-AgentLog INFO "Read $count message(s) from '$folderName'."
    }
  }

  if ($outlook) {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null
  }

  # Plain return, NOT `return , $messages`. The comma prevents unrolling, so
  # the caller's @() would then collect one item that is itself the array —
  # producing {"emails":[[...]]}, which the server rejects as malformed.
  # The caller wraps in @() instead, which handles the empty case correctly.
  return $messages
}

function Read-MailFromFixture {
  param($Config, $State)

  # Deterministic fixtures so a run without Outlook still exercises dedupe,
  # matching and the review queue. The second message deliberately carries no
  # container number, to prove the conversation-thread rule.
  $now = (Get-Date).ToUniversalTime()
  $messages = @(
    @{
      internetMessageId = "<mock-$(Get-Date -Format yyyyMMdd)-1@fixture.example>"
      conversationId    = 'mock-conv-1'
      entryId           = 'mock-entry-1'
      folder            = 'Inbox'
      subject           = 'Pickup number for CMAU9822570'
      senderName        = 'Fixture Dispatch'
      senderAddress     = 'dispatch@fixture.example'
      receivedAt        = $now.AddHours(-2).ToString('o')
      body              = "Container released.`nPU #: 5540221`n`nRegards"
      attachments       = @()
    },
    @{
      internetMessageId = "<mock-$(Get-Date -Format yyyyMMdd)-2@fixture.example>"
      conversationId    = 'mock-conv-1'
      entryId           = 'mock-entry-2'
      folder            = 'Inbox'
      subject           = 'RE: Pickup number'
      senderName        = 'Fixture Dispatch'
      senderAddress     = 'dispatch@fixture.example'
      receivedAt        = $now.AddHours(-1).ToString('o')
      body              = 'Driver is booked for the morning slot.'
      attachments       = @()
    }
  )

  Write-AgentLog INFO "Fixture provider produced $($messages.Count) message(s)."
  return $messages
}

# ------------------------------------------------------------------
# TMS API client
# ------------------------------------------------------------------
function Invoke-TmsApi {
  param(
    [Parameter(Mandatory)] $Config,
    [Parameter(Mandatory)] [string] $Path,
    [string] $Method = 'POST',
    $Body,
    [string] $Token
  )

  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  # Vercel Deployment Protection: without this the agent receives the SSO
  # redirect instead of the API and every push silently "succeeds" as HTML.
  if ($Config.PSObject.Properties.Name -contains 'protectionBypass' -and $Config.protectionBypass) {
    $headers['x-vercel-protection-bypass'] = $Config.protectionBypass
  }

  $uri = ($Config.apiBaseUrl.TrimEnd('/')) + $Path

  # ConvertTo-Json is called on the object, not through the pipeline: piping
  # a hashtable whose value is a single-element array can serialise `emails`
  # as an object instead of an array, which the server then rejects as a
  # malformed batch.
  $json = $null
  if ($null -ne $Body) {
    $json = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
    $script:LastPayload = $json
  }

  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers `
    -ContentType 'application/json' -Body $json -TimeoutSec 60
}

function Get-DeviceToken {
  if (Test-Path $script:TokenPath) {
    # DPAPI: the file is decryptable only by this user on this machine, so a
    # copied profile directory does not yield a usable credential.
    try {
      # Trim defensively: a token written by an older build may carry a BOM.
      $secure = (Get-Content $script:TokenPath -Raw).Trim([char]0xFEFF, [char]0x20, [char]0x0A, [char]0x0D) |
        ConvertTo-SecureString
      return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    } catch {
      Write-AgentLog WARN "Stored token could not be decrypted; re-enrolment required."
      Remove-Item $script:TokenPath -Force -ErrorAction SilentlyContinue
    }
  }
  return $null
}

function Save-DeviceToken {
  param([string] $Token)
  # ASCII, not utf8: PowerShell 5.1's "utf8" writes a BOM, Get-Content -Raw
  # returns it as a leading character, and ConvertTo-SecureString then fails
  # on every read. The DPAPI export is hex, so ASCII is lossless.
  $Token | ConvertTo-SecureString -AsPlainText -Force |
    ConvertFrom-SecureString |
    Set-Content -Path $script:TokenPath -Encoding ascii
}

function Register-Device {
  param($Config)

  if (-not ($Config.PSObject.Properties.Name -contains 'pairingCode') -or -not $Config.pairingCode) {
    throw "No device token yet and no pairingCode in the config. Generate a code in the TMS and add it."
  }

  Write-AgentLog INFO "Enrolling with pairing code..."
  $response = Invoke-TmsApi -Config $Config -Path '/api/agent/enroll' -Body @{
    code         = $Config.pairingCode
    mailbox      = if ($Config.PSObject.Properties.Name -contains 'mailbox') { $Config.mailbox } else { $null }
    agentVersion = '0.1.0'
  }

  Save-DeviceToken -Token $response.token
  Write-AgentLog INFO "Enrolled as device $($response.deviceId)."

  # The code is single-use; leaving it on disk invites a confusing retry.
  $Config.pairingCode = ''
  $Config | ConvertTo-Json -Depth 6 | Set-Content -Path $ConfigPath -Encoding utf8

  return $response.token
}

# ------------------------------------------------------------------
# Outbox -- durability across a dropped connection
# ------------------------------------------------------------------
function Get-Outbox {
  if (Test-Path $script:QueuePath) {
    try { return @(Get-Content $script:QueuePath -Raw -Encoding utf8 | ConvertFrom-Json) }
    catch { return @() }
  }
  return @()
}

function Save-Outbox {
  param($Messages)
  if ($Messages.Count -eq 0) {
    Remove-Item $script:QueuePath -Force -ErrorAction SilentlyContinue
  } else {
    # Bounded: a laptop offline for a fortnight must not accumulate an
    # unbounded spool. Oldest are dropped; the server dedupes anything that
    # arrives twice, and the watermark will re-read recent mail anyway.
    $capped = $Messages | Select-Object -Last 1000
    $capped | ConvertTo-Json -Depth 8 | Set-Content -Path $script:QueuePath -Encoding utf8
  }
}

function Send-Batch {
  param($Config, [string] $Token, $Messages)

  $sent = 0
  $remaining = @($Messages)

  while ($remaining.Count -gt 0) {
    $take = [Math]::Min($Config.batchSize, $remaining.Count)
    $chunk = @($remaining[0..($take - 1)])

    $attempt = 0
    $delivered = $false

    while (-not $delivered -and $attempt -lt 4) {
      $attempt++
      try {
        $result = Invoke-TmsApi -Config $Config -Path '/api/agent/emails' -Token $Token `
          -Body @{ emails = $chunk }
        Write-AgentLog INFO ("Batch accepted: stored={0} duplicates={1} linked={2} review={3}" -f `
          $result.stored, $result.duplicates, $result.linked, $result.needsReview)
        $delivered = $true
        $sent += $chunk.Count
      } catch {
        $status = $null
        $serverSaid = ''
        if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
          $status = [int]$_.Exception.Response.StatusCode
          # Read the body. A bare "HTTP 400" tells an operator nothing, and
          # the server explains exactly which field it rejected.
          try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $serverSaid = $reader.ReadToEnd()
            $reader.Close()
          } catch { }
        }

        # A rejected batch will be rejected identically forever. Retrying a
        # 400 or 401 just delays the report of a real problem.
        if ($status -eq 400 -or $status -eq 401) {
          Write-AgentLog ERROR "Server rejected the batch (HTTP $status). Not retrying."
          if ($serverSaid) { Write-AgentLog ERROR "  server said: $serverSaid" }
          if ($script:LastPayload) {
            $preview = $script:LastPayload.Substring(0, [Math]::Min(400, $script:LastPayload.Length))
            Write-AgentLog ERROR "  payload sent: $preview"
          }
          if ($status -eq 401) {
            Write-AgentLog ERROR "Device token rejected -- it may have been revoked. Re-enrol."
            Remove-Item $script:TokenPath -Force -ErrorAction SilentlyContinue
          }
          return $sent
        }

        $backoff = [Math]::Pow(2, $attempt) * 2
        Write-AgentLog WARN "Send failed (attempt $attempt): $($_.Exception.Message). Retrying in ${backoff}s."
        Start-Sleep -Seconds $backoff
      }
    }

    if (-not $delivered) {
      Write-AgentLog WARN "Giving up on this cycle; $($remaining.Count) message(s) stay queued."
      Save-Outbox -Messages $remaining
      return $sent
    }

    # Assign inside each branch rather than capturing the `if` as an
    # expression. PowerShell unrolls an empty array returned from a statement
    # into nothing, so `$x = if (...) { @() }` leaves $x as $null — and the
    # next `$remaining.Count` then throws under Set-StrictMode.
    if ($remaining.Count -gt $take) {
      $remaining = @($remaining[$take..($remaining.Count - 1)])
    } else {
      $remaining = @()
    }
  }

  Save-Outbox -Messages @()
  return $sent
}

# ------------------------------------------------------------------
# One cycle
# ------------------------------------------------------------------
function Invoke-SyncCycle {
  param($Config, [switch] $UseMock)

  $token = Get-DeviceToken
  if (-not $token) { $token = Register-Device -Config $Config }

  try {
    Invoke-TmsApi -Config $Config -Path '/api/agent/heartbeat' -Token $token `
      -Body @{ agentVersion = '0.1.0' } | Out-Null
  } catch {
    Write-AgentLog WARN "Heartbeat failed: $($_.Exception.Message)"
  }

  $state = Get-AgentState

  # Anything stranded by an earlier failure goes first, so ordering is
  # preserved and nothing is starved by a steady stream of new mail.
  $pending = @(Get-Outbox)
  if ($pending.Count -gt 0) {
    Write-AgentLog INFO "Retrying $($pending.Count) queued message(s)."
  }

  # @() here is what guarantees array-ness: it collects zero, one or many
  # messages into a real array, so .Count is always valid downstream.
  $fresh = @()
  if ($UseMock) {
    $fresh = @(Read-MailFromFixture -Config $Config -State $state)
  } else {
    $fresh = @(Read-MailFromOutlook -Config $Config -State $state)
  }

  $all = @($pending) + @($fresh)
  if ($all.Count -eq 0) {
    Write-AgentLog INFO "Nothing new."
    Save-AgentState -State $state
    return
  }

  $sent = Send-Batch -Config $Config -Token $token -Messages $all

  # The watermark advances only after a successful send. Losing mail because
  # the watermark moved past a batch that never arrived is unrecoverable;
  # re-sending one the server already has costs a dedupe row.
  if ($sent -gt 0) { Save-AgentState -State $state }
}

# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
try {
  $config = Get-AgentConfig -Path $ConfigPath
  Write-AgentLog INFO "Agent starting. API=$($config.apiBaseUrl) mock=$($Mock.IsPresent)"

  if ($Once) {
    Invoke-SyncCycle -Config $config -UseMock:$Mock
    Write-AgentLog INFO "Single cycle complete."
    exit 0
  }

  while ($true) {
    try {
      Invoke-SyncCycle -Config $config -UseMock:$Mock
    } catch {
      # One bad cycle must not kill the agent -- it would stop silently and
      # look exactly like "no new mail".
      Write-AgentLog ERROR "Cycle failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $config.pollSeconds
  }
} catch {
  # Include where it happened. "Fatal: <message>" with no location is
  # unsupportable on a machine you cannot attach a debugger to.
  Write-AgentLog ERROR "Fatal: $($_.Exception.Message)"
  Write-AgentLog ERROR "  at $($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)"
  Write-AgentLog ERROR "  >> $($_.InvocationInfo.Line.Trim())"
  exit 1
}
