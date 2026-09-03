#!/usr/bin/env pwsh

$ErrorActionPreference = 'Stop'

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}
catch {}

$ConfigRepository = 'https://github.com/ovftank/claude-code-config.git'
$ClaudeDir = Join-Path $env:USERPROFILE '.claude'
$Files = @('CLAUDE.md', 'settings.json', 'statusline-command.sh', 'keybindings.json', 'themes/dracula.json')

$ClaudeLogoMaskIdle = @(
    '................',
    '................',
    '................',
    '..############..',
    '..############..',
    '..##.######.##..',
    '..##.######.##..',
    '################',
    '################',
    '..############..',
    '..############..',
    '...#.#....#.#...',
    '...#.#....#.#...',
    '................',
    '................',
    '................'
)
$ClaudeLogoMaskJump = $ClaudeLogoMaskIdle.Clone()
$ClaudeLogoMaskJump[11] = '..#...#..#...#..'
$ClaudeLogoMaskJump[12] = '..#...#..#...#..'

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required command not found: $Name" }
}

function Update-SessionPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
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

function Test-InstallerInteractiveOutput {
    return (-not [Console]::IsOutputRedirected) -and ($env:TERM -ne 'dumb')
}

function Write-Step {
    # Overwrites the current console line instead of scrolling, so the whole install
    # reads as one status line updating under the logo. Falls back to plain scrolling
    # lines when output isn't an interactive console (e.g. piped to a log file).
    param([string]$Text)
    if (Test-InstallerInteractiveOutput) {
        Write-Host ("`r" + $Text.PadRight(72)) -ForegroundColor DarkYellow -NoNewline
    }
    else {
        Write-Host $Text -ForegroundColor Cyan
    }
}

function Complete-Step {
    param([string]$Text)
    if (Test-InstallerInteractiveOutput) {
        Write-Host ("`r" + $Text.PadRight(72)) -ForegroundColor Green
    }
    else {
        Write-Host $Text -ForegroundColor Green
    }
}

function Enable-VirtualTerminalOutput {
    if (-not (Test-InstallerInteractiveOutput)) { return $false }
    if ($null -ne $script:ClaudeVirtualTerminalEnabled) { return $script:ClaudeVirtualTerminalEnabled }

    if (-not ('ClaudeInstaller.NativeMethods' -as [Type])) {
        Add-Type -Namespace ClaudeInstaller -Name NativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern System.IntPtr GetStdHandle(int nStdHandle);
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern bool GetConsoleMode(System.IntPtr hConsoleHandle, out uint lpMode);
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetConsoleMode(System.IntPtr hConsoleHandle, uint dwMode);
'@
    }

    $handle = [ClaudeInstaller.NativeMethods]::GetStdHandle(-11)
    $mode = [uint32]0
    $script:ClaudeVirtualTerminalEnabled = [ClaudeInstaller.NativeMethods]::GetConsoleMode($handle, [ref]$mode) -and [ClaudeInstaller.NativeMethods]::SetConsoleMode($handle, ($mode -bor 0x0004))
    return $script:ClaudeVirtualTerminalEnabled
}

function Get-ClaudeLogoFrameText {
    param([string[]]$Mask, [string]$Status)
    $block = [string]([char]0x2588) * 2
    $lines = $Mask | ForEach-Object { $_ -replace '#', $block -replace '\.', '  ' }
    $width = 32
    $padded = $Status.PadLeft(([Math]::Floor(($width + $Status.Length) / 2))).PadRight($width)
    return ($lines -join "`n") + "`n`n$padded"
}

function Show-ClaudeLogoAnimation {
    param([string[]]$StatusMessages = @('Waking up...', 'Stretching...', 'Warming up...', 'Almost there...', 'Loading config...', 'Ready!'))

    if (-not (Enable-VirtualTerminalOutput)) {
        foreach ($line in $ClaudeLogoMaskIdle) {
            Write-Host ($line -replace '#', '##' -replace '\.', '  ') -ForegroundColor DarkYellow
        }
        Write-Host $StatusMessages[-1] -ForegroundColor DarkGray
        return
    }

    $esc = [char]27 + '['
    $cursorHome = "${esc}H"
    $reset = "${esc}0m"
    $orange = "${esc}38;2;217;119;87m"
    $bold = "${esc}1m"

    [Console]::Write("${esc}?25l${esc}2J${cursorHome}")
    for ($i = 0; $i -lt $StatusMessages.Count; $i++) {
        $mask = if ($i % 2 -eq 0) { $ClaudeLogoMaskIdle } else { $ClaudeLogoMaskJump }
        $frame = Get-ClaudeLogoFrameText -Mask $mask -Status $StatusMessages[$i]
        [Console]::Write("$cursorHome$orange$frame$reset")
        Start-Sleep -Milliseconds 220
    }
    $final = Get-ClaudeLogoFrameText -Mask $ClaudeLogoMaskIdle -Status $StatusMessages[-1]
    [Console]::Write("$cursorHome$bold$orange$final$reset")
    Start-Sleep -Milliseconds 200
    [Console]::Write("`n${esc}?25h`n")
}

Show-ClaudeLogoAnimation

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing Claude Code...'
    Invoke-Expression (Invoke-RestMethod -UseBasicParsing 'https://claude.ai/install.ps1') 6>$null
    Update-SessionPath
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    $localBin = Join-Path $env:USERPROFILE '.local\bin'
    if (Test-Path (Join-Path $localBin 'claude.exe')) {
        Add-ToUserPath $localBin
    }
}

Assert-Command 'claude'
Complete-Step 'Claude Code ready'

Write-Step 'Setting up environment...'
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
    # Default components minus the two Explorer context-menu entries (Open Git Bash/GUI here)
    Start-Process $gitInstaller -ArgumentList '/VERYSILENT /NORESTART /NOCANCEL /SP- /COMPONENTS="ext,gitlfs,assoc,assoc_sh,scalar" /o:PathOption=CmdTools /o:DefaultBranchOption=main' -Wait
    Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue
    Update-SessionPath
}

Assert-Command 'git'

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitRoot = Split-Path (Split-Path $gitCmd.Source -Parent) -Parent
    $gitBash = Join-Path $gitRoot 'bin\bash.exe'
    if (Test-Path $gitBash) {
        try {
            [Environment]::SetEnvironmentVariable('CLAUDE_CODE_GIT_BASH_PATH', $gitBash, 'Machine')
        }
        catch {
            [Environment]::SetEnvironmentVariable('CLAUDE_CODE_GIT_BASH_PATH', $gitBash, 'User')
        }
        $env:CLAUDE_CODE_GIT_BASH_PATH = $gitBash
    }
}
Complete-Step 'Environment ready'

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

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) "claude-code-config-$PID"
try {
    Write-Step 'Cloning config...'
    $prevErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    git clone --depth 1 $ConfigRepository $tmpDir 2>$null
    $ErrorActionPreference = $prevErrorAction
    if ($LASTEXITCODE -ne 0) { throw "git clone failed with exit code $LASTEXITCODE" }

    New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null

    foreach ($file in $Files) {
        Write-Step "Installing config: $file..."
        $dest = Join-Path $ClaudeDir $file
        $src = Join-Path $tmpDir $file
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Copy-Item -LiteralPath $src -Destination $dest -Force
    }

    Complete-Step "Done. Config installed to $ClaudeDir"
}
finally {
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
