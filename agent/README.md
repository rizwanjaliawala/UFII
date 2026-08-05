# Utopia TMS — Outlook sync agent

Reads container-related mail from Outlook Desktop and pushes the extracted
fields to the TMS API.

## Why an agent exists at all

A browser cannot reach Outlook — there is no web API for "is Outlook
installed", and none for reading a local mailbox. A Vercel function cannot
either: Outlook COM automation needs a Windows **desktop session**, and a
serverless function has none.

So the only workable shape is a small process running in the operator's own
Windows session. The web app keeps reading only from Neon; the agent is the
one component that touches Outlook.

## Requirements

- Windows with **Outlook Desktop installed, running and signed in**
- Windows PowerShell 5.1 (ships with Windows — nothing to install)
- Network access to the TMS API

Outlook on the web is not enough. COM automation drives the installed
application; there is no equivalent for OWA without Microsoft Graph, which
docs 05 and 12 rule out.

## Install

1. In the TMS, generate a pairing code (Administration → Sync agents). It is
   single-use and expires in 15 minutes.
2. On the operator's PC, from this folder:

```powershell
.\Install-Agent.ps1 -PairingCode ABCD1234 -ApiBaseUrl https://utopia-tms.vercel.app
```

The installer enrols, runs one real cycle, and **only registers the scheduled
task if that cycle succeeds**. A task that has never worked would otherwise
fail silently at the next logon.

No administrator rights are needed: the task is per-user by design.

### Behind Vercel Deployment Protection

While the deployment is protected, pass the bypass secret too, or the agent
receives the SSO redirect instead of the API:

```powershell
.\Install-Agent.ps1 -PairingCode ABCD1234 -ProtectionBypass <secret>
```

## Verify without Outlook

The agent has a fixture provider, so the whole pipeline — enrolment,
batching, dedupe, retry, watermark — can be exercised on a machine with no
Office installed:

```powershell
.\UtopiaTmsAgent.ps1 -Mock -Once
```

## How it behaves

| Concern | Behaviour |
|---|---|
| Duplicates | Deduped server-side on the **Internet Message-Id**, not the Outlook Entry ID — Entry IDs change when an item moves folder or store |
| Restarts | A per-folder watermark is persisted, so it resumes rather than re-reading the mailbox |
| Watermark safety | Advances **only after a successful send**. Re-sending costs a dedupe row; losing mail is unrecoverable |
| Offline | Messages queue to disk, capped at 1,000, retried oldest-first next cycle |
| Retries | Exponential backoff, 4 attempts. A 400 or 401 is **not** retried — it will fail identically forever |
| Revocation | A 401 deletes the stored token and asks for re-enrolment |
| Token storage | DPAPI-encrypted, decryptable only by that user on that machine |
| Logs | `%LOCALAPPDATA%\UtopiaTMS\Agent\logs`, one file per day, 14 kept |

## Scope of what is read

Restricted to the folders named in `agent.config.json` (default `Inbox`), and
optionally to subjects matching `subjectMustMatch`. Bodies are truncated to
`maxBodyChars` before sending and truncated again server-side.

Reading and storing an entire mailbox is neither necessary nor defensible —
narrow the folders and set a subject pattern before deploying widely.

## Uninstall

```powershell
Unregister-ScheduledTask -TaskName 'Utopia TMS Sync Agent' -Confirm:$false
```

Then revoke the device in the TMS, which invalidates its token immediately.

## PowerShell traps this script already works around

Three bugs cost a debugging cycle each. They are invisible until the script
runs on a real machine, so do not "simplify" them back out.

**Non-ASCII characters break parsing.** PowerShell 5.1 reads `.ps1` as the
ANSI codepage unless the file has a BOM. A UTF-8 em dash decodes to bytes
ending in `0x94`, which in CP1252 is a right smart quote — and PowerShell
accepts smart quotes as **string delimiters**, so the string terminates
mid-line and the parse cascades into "missing closing brace". These scripts
are deliberately pure ASCII.

**`$x = if (...) { @() }` yields `$null`, not an empty array.** PowerShell
unrolls an empty array returned from a statement into nothing. The next
`$x.Count` then throws under `Set-StrictMode`. Assign inside each branch.

**`return , $array` plus a caller's `@()` produces a nested array.** The comma
stops unrolling, so `@()` collects one item that is itself the array, and the
payload goes out as `{"emails":[[...]]}`. Providers return plainly; the caller
wraps with `@()`.
