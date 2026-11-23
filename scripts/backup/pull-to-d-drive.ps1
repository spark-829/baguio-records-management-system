<#
Copies the newest encrypted backup from Cloudflare R2 to this PC. Never decrypts it.
Setup: aws configure --profile rms-r2   (use the READ-ONLY R2 token, region auto)
Set RMS_R2_ENDPOINT (https://<account id>.r2.cloudflarestorage.com) and RMS_R2_BUCKET, or pass the parameters.
#>
param(
  [string]$Dest = 'D:\RMS-Backups',
  [int]$Keep = 30,
  [string]$Endpoint = $env:RMS_R2_ENDPOINT,
  [string]$Bucket = $env:RMS_R2_BUCKET
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$log = Join-Path $Dest 'pull.log'
function Log($m) { Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }

try {
  if (-not $Endpoint -or -not $Bucket) { throw 'RMS_R2_ENDPOINT and RMS_R2_BUCKET (or -Endpoint and -Bucket) are required.' }
  $aws = @('--profile', 'rms-r2', '--endpoint-url', $Endpoint)

  $key = (& aws @aws s3 cp "s3://$Bucket/latest.txt" - | Out-String).Trim()
  if ($key -notmatch '^daily/rms-[0-9-]+\.tar\.gz\.gpg$') { throw 'latest.txt has an unexpected value.' }
  $name = Split-Path $key -Leaf
  $gpg = Join-Path $Dest $name
  $sha = "$gpg.sha256"

  if ((Test-Path $gpg) -and (Test-Path $sha)) {
    Log "Already have $name"
  } else {
    & aws @aws s3 cp "s3://$Bucket/$key" $gpg --only-show-errors
    & aws @aws s3 cp "s3://$Bucket/$key.sha256" $sha --only-show-errors
    $want = ((Get-Content $sha -TotalCount 1) -split '\s+')[0].ToLower()
    $got = (Get-FileHash -Algorithm SHA256 $gpg).Hash.ToLower()
    if ($want -ne $got) {
      Remove-Item $gpg, $sha -Force
      throw "Checksum mismatch for $name. Partial file deleted."
    }
    Log "Downloaded and verified $name"
  }

  Get-ChildItem $Dest -Filter 'rms-*.tar.gz.gpg' | Sort-Object Name -Descending | Select-Object -Skip $Keep | ForEach-Object {
    Remove-Item $_.FullName, "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
    Log "Removed old backup $($_.Name)"
  }
} catch {
  Log "ERROR $($_.Exception.Message)"
  exit 1
}
