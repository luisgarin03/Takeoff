$ErrorActionPreference = 'Stop'
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) { throw 'Install the Supabase CLI and run supabase login first.' }
Push-Location $PSScriptRoot
try {
 & supabase link --project-ref oeprbftxfnksgdqztezq
 if ($LASTEXITCODE -ne 0) { throw 'Supabase link failed.' }
 & supabase db query --linked --file supabase/migrations/202611010001_website_admin.sql
 if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
 Write-Host 'Admin database setup complete. Existing app data was preserved.'
} finally { Pop-Location }
