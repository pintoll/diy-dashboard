# Grants the given user Modify rights on the Windows hosts file.
# Runs elevated (invoked via Start-Process -Verb RunAs). One-time setup so the
# app can edit hosts at runtime without further UAC prompts.
param(
    [Parameter(Mandatory = $true)]
    [string]$User
)

$ErrorActionPreference = "Stop"
$hosts = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"

try {
    icacls $hosts /grant "${User}:(M)" | Out-Null
    exit 0
} catch {
    Write-Error $_
    exit 1
}
