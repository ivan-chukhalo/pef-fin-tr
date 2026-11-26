param([string]$SupabaseCli = 'npx.cmd')

$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectPath '.env.local'
$projectUrl = Select-String -LiteralPath $envFile -Pattern '^VITE_SUPABASE_URL\s*=\s*["'']?https://([a-z]{20})\.supabase\.co/?["'']?\s*$' | Select-Object -First 1
if (-not $projectUrl) { throw 'У .env.local потрібен URL проєкту Supabase.' }
$projectRef = $projectUrl.Matches[0].Groups[1].Value
$passwordLine = Select-String -LiteralPath $envFile -Pattern '^SUPABASE_DB_PASSWORD\s*=\s*(.+)$' | Select-Object -First 1
$previousPassword = $env:SUPABASE_DB_PASSWORD
$previousEncoding = [Console]::OutputEncoding
$utf8 = [System.Text.UTF8Encoding]::new($false)

$cliArgs = @('db', 'query', "--remote=$projectRef", '--read-only', '-o', 'json', '--file', (Join-Path $PSScriptRoot 'export-data.sql'))
if ($SupabaseCli -eq 'npx.cmd') { $cliArgs = @('supabase') + $cliArgs }
try {
    if ($passwordLine) { $env:SUPABASE_DB_PASSWORD = $passwordLine.Matches[0].Groups[1].Value.Trim() }
    [Console]::OutputEncoding = $utf8
    $output = & $SupabaseCli @cliArgs
    if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI не виконав запит експорту.' }
} finally {
    $env:SUPABASE_DB_PASSWORD = $previousPassword
    [Console]::OutputEncoding = $previousEncoding
}

$response = ($output -join [Environment]::NewLine) | ConvertFrom-Json
if (@($response.rows).Count -ne 1 -or -not $response.rows[0].backup) { throw 'Supabase не повернув JSON експорту.' }
$backup = $response.rows[0].backup
$data = $backup | ConvertFrom-Json
if ($data.format_version -ne 1 -or -not $data.exported_at) { throw 'Формат експорту не розпізнано.' }
foreach ($table in 'accounts', 'categories', 'transactions', 'transfers', 'recurring_templates', 'category_history', 'category_budget_limits') {
    if ($data.$table -isnot [array]) { throw "В експорті відсутня таблиця $table." }
}

$backupDirectory = Join-Path $env:LOCALAPPDATA 'pef-fin-tr/backups'
[System.IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfffZ')
$destination = Join-Path $backupDirectory "pef-fin-tr-$timestamp.json"
$temporaryFile = "$destination.$([Guid]::NewGuid().ToString('N')).tmp"
try {
    [System.IO.File]::WriteAllText($temporaryFile, $backup + [Environment]::NewLine, $utf8)
    [System.IO.File]::Move($temporaryFile, $destination)
} finally {
    if ([System.IO.File]::Exists($temporaryFile)) { [System.IO.File]::Delete($temporaryFile) }
}

Write-Output $destination
