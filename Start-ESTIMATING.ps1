param([int]$Port = 5174, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$clientRoot = Join-Path $taskRoot 'vite-version'
$runtimeRoot = Join-Path $taskRoot '.runtime'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a port between 1024 and 65535.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 or newer (includes npm), then retry.' }
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'Node.js 24 or newer is required.' }
$envPath = Join-Path $clientRoot '.env.local'
if (-not (Test-Path -LiteralPath $envPath)) {
 $sourceEnv = 'C:\Apps\opentakeoff cloudfare\web\.env.local'
 if (Test-Path -LiteralPath $sourceEnv) {
  $publicSettings = Get-Content -LiteralPath $sourceEnv | Where-Object { $_ -match '^VITE_SUPABASE_(URL|PUBLISHABLE_KEY|ANON_KEY)=' }
  [IO.File]::WriteAllLines($envPath, [string[]]$publicSettings, [Text.UTF8Encoding]::new($false))
 } else { throw 'Create vite-version/.env.local using .env.example and set the Supabase URL and public key.' }
}
$settings = Get-Content -Raw -LiteralPath $envPath
if ($settings -notmatch '(?m)^VITE_SUPABASE_URL=.+') { throw 'Set VITE_SUPABASE_URL in vite-version/.env.local.' }
if ($settings -notmatch '(?m)^VITE_SUPABASE_(PUBLISHABLE_KEY|ANON_KEY)=.+') { throw 'Set a Supabase public publishable/anon key in vite-version/.env.local.' }
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$baseUrl = "http://127.0.0.1:$Port"
function Test-Website {
 try { return (Invoke-RestMethod -Uri "$baseUrl/estimating-site.json" -TimeoutSec 2).app -eq 'estimating-website-admin' } catch { return $false }
}
if (Test-Website) {
 Write-Host "Already running. Website: $baseUrl/landing | Admin: $baseUrl/dashboard"
 if (-not $NoBrowser) { Start-Process "$baseUrl/landing"; Start-Process "$baseUrl/dashboard" }
 return
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is occupied by another app. Run with -Port 5175 or close that app." }
$lockHash = (Get-FileHash -LiteralPath (Join-Path $clientRoot 'package-lock.json') -Algorithm SHA256).Hash
$hashPath = Join-Path $runtimeRoot 'dependency-hash'
$previousHash = if (Test-Path -LiteralPath $hashPath) { (Get-Content -Raw -LiteralPath $hashPath).Trim() } else { '' }
if (-not (Test-Path -LiteralPath (Join-Path $clientRoot 'node_modules/vite/bin/vite.js')) -or $previousHash -ne $lockHash) {
 Write-Host 'Initializing dependencies...'
 Push-Location $clientRoot
 try { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check your internet connection and retry.' } }
 finally { Pop-Location }
 Set-Content -LiteralPath $hashPath -Value $lockHash
}
if (-not (Test-Website)) {
 if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is occupied by another app. Run with -Port 5175 or close that app." }
 $viteEntry = Join-Path $clientRoot 'node_modules/vite/bin/vite.js'
 $server = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"'+$viteEntry+'"'), '--host', '127.0.0.1', '--port', "$Port", '--strictPort') -WorkingDirectory $clientRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'server.log') -RedirectStandardError (Join-Path $runtimeRoot 'server-error.log') -PassThru
 Set-Content -LiteralPath (Join-Path $runtimeRoot 'server.pid') -Value $server.Id
 $ready = $false
 for ($attempt=0; $attempt -lt 40; $attempt++) {
  if (Test-Website) { $ready=$true; break }
  if ($server.HasExited) { break }
  Start-Sleep -Milliseconds 500
 }
 if (-not $ready) { throw "The server did not start. Check $runtimeRoot\server-error.log." }
}
Write-Host "Website: $baseUrl/landing" -ForegroundColor Green
Write-Host "Admin:   $baseUrl/dashboard" -ForegroundColor Green
Write-Host 'Sign in using the allowlisted OpenTakeoff administrator account.'
if (-not $NoBrowser) { Start-Process "$baseUrl/landing"; Start-Process "$baseUrl/dashboard" }
