#!/usr/bin/env pwsh

$ErrorActionPreference = 'Stop'

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}
catch {}

$ConfigRepository = 'https://github.com/ovftank/pi-config.git'
$HerdrAppDir = Join-Path $env:USERPROFILE '.config\herdr-app'
$PiDir = Join-Path $env:USERPROFILE '.pi\agent'
$Generated = @('gpui-kit.d.ts', 'herdr.d.ts', 'jsconfig.json')

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required command not found: $Name" }
}

function Update-SessionPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Install-File {
    param([string]$Source, [string]$Destination)

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Install-Folder {
    param([string]$Source, [string]$Destination)

    Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
        if ($Generated -contains $_.Name) { return }
        $relative = $_.FullName.Substring($Source.Length).TrimStart('\', '/')
        Install-File -Source $_.FullName -Destination (Join-Path $Destination $relative)
    }
}

function Add-ToUserPath {
    param([string]$Dir)
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (($userPath -split ';' | Where-Object { $_ }) -contains $Dir) { return }
    $newPath = if ($userPath) { "$userPath;$Dir" } else { $Dir }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Update-SessionPath
}

function Install-GitHubTool {
    param([string]$Command, [string]$Repo, [string]$AssetPattern)
    if (Get-Command $Command -ErrorAction SilentlyContinue) { return }
    try {
        Write-Step "Installing $Command..."
        $asset = (Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$Repo/releases/latest").assets |
        Where-Object { $_.name -like $AssetPattern } | Select-Object -First 1
        if (-not $asset) { throw "no release asset matching '$AssetPattern'" }

        $toolsDir = Join-Path $env:USERPROFILE '.local\bin'
        New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
        $dl = Join-Path ([IO.Path]::GetTempPath()) $asset.name
        Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $dl
        $destExe = Join-Path $toolsDir "$Command.exe"

        if ($asset.name -like '*.exe') {
            Copy-Item $dl -Destination $destExe -Force
        }
        else {
            $extractDir = Join-Path ([IO.Path]::GetTempPath()) "extract-$Command-$PID"
            New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
            if ($asset.name -like '*.zip') {
                Expand-Archive -Path $dl -DestinationPath $extractDir -Force
            }
            else {
                tar -xzf $dl -C $extractDir
            }
            $exe = Get-ChildItem -Path $extractDir -Filter "$Command.exe" -Recurse | Select-Object -First 1
            if (-not $exe) { throw "'$Command.exe' not found inside $($asset.name)" }
            Copy-Item $exe.FullName -Destination $destExe -Force
            Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $dl -Force -ErrorAction SilentlyContinue
        Add-ToUserPath $toolsDir
    }
    catch {
        Write-Warning "Skipping $Command`: $_"
    }
}

function Write-Step {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Cyan
}

function Complete-Step {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Green
}

try {
    [Environment]::SetEnvironmentVariable('COLORTERM', 'truecolor', 'Machine')
}
catch {
    [Environment]::SetEnvironmentVariable('COLORTERM', 'truecolor', 'User')
}

$env:COLORTERM = 'truecolor'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing Git...'
    $gitAsset = (Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/git-for-windows/git/releases/latest').assets |
    Where-Object { $_.name -like '*-64-bit.exe' } | Select-Object -First 1
    $gitInstaller = Join-Path ([IO.Path]::GetTempPath()) $gitAsset.name
    Invoke-WebRequest -UseBasicParsing $gitAsset.browser_download_url -OutFile $gitInstaller
    Start-Process $gitInstaller -ArgumentList '/VERYSILENT /NORESTART /NOCANCEL /SP- /COMPONENTS="ext,gitlfs,assoc,assoc_sh,scalar" /o:PathOption=CmdTools /o:DefaultBranchOption=main' -Wait
    Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue
    Update-SessionPath
}

Assert-Command 'git'
Complete-Step 'Git ready'

Write-Step 'Setting PowerShell execution policy...'
if ((Get-ExecutionPolicy -Scope CurrentUser) -ne 'Bypass') {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass -Force
}
Complete-Step 'Execution policy ready'

Write-Step 'Installing dev tools...'
Install-GitHubTool -Command 'rg' -Repo 'BurntSushi/ripgrep' -AssetPattern '*x86_64-pc-windows-msvc.zip'
Install-GitHubTool -Command 'fd' -Repo 'sharkdp/fd' -AssetPattern '*x86_64-pc-windows-msvc.zip'
Install-GitHubTool -Command 'srcwalk' -Repo 'sting8k/srcwalk' -AssetPattern '*x86_64-pc-windows-msvc.tar.gz'
Install-GitHubTool -Command 'eza' -Repo 'eza-community/eza' -AssetPattern 'eza.exe_x86_64-pc-windows-gnu.zip'
Install-GitHubTool -Command 'jq' -Repo 'jqlang/jq' -AssetPattern 'jq-windows-amd64.exe'
Install-GitHubTool -Command 'gh' -Repo 'cli/cli' -AssetPattern '*_windows_amd64.zip'
Install-GitHubTool -Command 'ast-grep' -Repo 'ast-grep/ast-grep' -AssetPattern 'app-x86_64-pc-windows-msvc.zip'

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing uv...'
    try {
        Invoke-Expression (Invoke-RestMethod -UseBasicParsing 'https://astral.sh/uv/install.ps1') 6>$null
        Update-SessionPath
    }
    catch {
        Write-Warning "Skipping uv: $_"
    }
}
Complete-Step 'Dev tools ready'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing Node.js...'
    try {
        $nodeVersion = 'v24.22.2'
        $nodeFeatures = 'NodeRuntime,npm,EnvironmentPathNode,EnvironmentPathNpmModules'
        $nodeMsi = Join-Path ([IO.Path]::GetTempPath()) "node-$nodeVersion-x64.msi"
        Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-x64.msi" -OutFile $nodeMsi
        $install = Start-Process msiexec.exe -ArgumentList '/i', "`"$nodeMsi`"", '/qn', '/norestart', "ADDLOCAL=$nodeFeatures" -Wait -PassThru
        Remove-Item $nodeMsi -Force -ErrorAction SilentlyContinue
        if ($install.ExitCode -ne 0) { throw "msiexec exited $($install.ExitCode) - needs an elevated shell" }
        Update-SessionPath
    }
    catch {
        Write-Warning "Skipping Node.js: $_"
    }
}
if (Get-Command node -ErrorAction SilentlyContinue) {
    Complete-Step 'Node.js ready'
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
        Write-Step 'Installing pi...'
        try {
            npm install -g '@earendil-works/pi-coding-agent'
            if ($LASTEXITCODE -ne 0) { throw "npm install exited $LASTEXITCODE" }
            Update-SessionPath
        }
        catch {
            Write-Warning "Skipping pi: $_"
        }
    }
    if (Get-Command pi -ErrorAction SilentlyContinue) {
        Complete-Step 'pi ready'
    }
}

if (-not (Get-Command herdr-app -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing herdr-app...'
    try {
        Invoke-Expression (Invoke-RestMethod -UseBasicParsing 'https://releases.herdr.dev/app/install.ps1') 6>$null
        Update-SessionPath
    }
    catch {
        Write-Warning "Skipping herdr-app: $_"
    }
}
if (Get-Command herdr-app -ErrorAction SilentlyContinue) {
    Complete-Step 'herdr-app ready'
}

tmpDir = Join-Path ([IO.Path]::GetTempPath()) "pi-config-$PID"
try {
    Write-Step 'Cloning config...'
    $prevErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    git clone --depth 1 $ConfigRepository $tmpDir 2>$null
    $ErrorActionPreference = $prevErrorAction
    if ($LASTEXITCODE -ne 0) { throw "git clone failed with exit code $LASTEXITCODE" }

    Write-Step 'Installing herdr-app window config...'
    New-Item -ItemType Directory -Force -Path $HerdrAppDir | Out-Null

    foreach ($file in @('settings.json', 'keys.json')) {
        Install-File -Source (Join-Path $tmpDir "herdr-app\$file") -Destination (Join-Path $HerdrAppDir $file)
    }

    foreach ($folder in @('layouts', 'themes', 'mods')) {
        Install-Folder -Source (Join-Path $tmpDir "herdr-app\$folder") -Destination (Join-Path $HerdrAppDir $folder)
    }

    Write-Step 'Installing pi config...'
    New-Item -ItemType Directory -Force -Path $PiDir | Out-Null

    foreach ($file in @('settings.json', 'keybindings.json', 'AGENTS.md')) {
        Install-File -Source (Join-Path $tmpDir "pi\$file") -Destination (Join-Path $PiDir $file)
    }

    foreach ($folder in @('themes', 'skills')) {
        Install-Folder -Source (Join-Path $tmpDir "pi\$folder") -Destination (Join-Path $PiDir $folder)
    }

    Complete-Step "  pi config in $PiDir"

    if (Get-Command herdr-app -ErrorAction SilentlyContinue) {
        foreach ($mod in Get-ChildItem -LiteralPath (Join-Path $HerdrAppDir 'mods') -Directory) {
            herdr-app check $mod.FullName 2>&1 | Where-Object { $_ -like 'check passed*' } | ForEach-Object { Complete-Step "  $_" }
        }
    }

    Complete-Step "Done. pi config in $PiDir, herdr-app config in $HerdrAppDir"
}
finally {
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
