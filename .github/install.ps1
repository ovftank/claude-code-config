#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

$ConfigRepository = "https://github.com/ovftank/claude-code-config.git"
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$Files = @("CLAUDE.md", "settings.json", "statusline-command.sh", "keybindings.json", "themes/dracula.json")

$ClaudeLogoMaskIdle = @(
    "................",
    "................",
    "................",
    "..############..",
    "..############..",
    "..##.######.##..",
    "..##.######.##..",
    "################",
    "################",
    "..############..",
    "..############..",
    "...#.#....#.#...",
    "...#.#....#.#...",
    "................",
    "................",
    "................"
)
$ClaudeLogoMaskJump = $ClaudeLogoMaskIdle.Clone()
$ClaudeLogoMaskJump[11] = "..#...#..#...#.."
$ClaudeLogoMaskJump[12] = "..#...#..#...#.."

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required command not found: $Name" }
}

function Update-SessionPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Test-InstallerInteractiveOutput {
    return (-not [Console]::IsOutputRedirected) -and ($env:TERM -ne "dumb")
}

function Enable-VirtualTerminalOutput {
    if (-not (Test-InstallerInteractiveOutput)) { return $false }
    if ($null -ne $script:ClaudeVirtualTerminalEnabled) { return $script:ClaudeVirtualTerminalEnabled }

    if (-not ("ClaudeInstaller.NativeMethods" -as [Type])) {
        Add-Type -Namespace ClaudeInstaller -Name NativeMethods -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern System.IntPtr GetStdHandle(int nStdHandle);
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern bool GetConsoleMode(System.IntPtr hConsoleHandle, out uint lpMode);
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetConsoleMode(System.IntPtr hConsoleHandle, uint dwMode);
"@
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
    param([string[]]$StatusMessages = @("Waking up...", "Stretching...", "Warming up...", "Almost there...", "Loading config...", "Ready!"))

    if (-not (Enable-VirtualTerminalOutput)) {
        foreach ($line in $ClaudeLogoMaskIdle) {
            Write-Host ($line -replace '#', '##' -replace '\.', '  ') -ForegroundColor DarkYellow
        }
        Write-Host $StatusMessages[-1] -ForegroundColor DarkGray
        return
    }

    $esc = [char]27 + "["
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
    Write-Host "Claude Code not found, installing..." -ForegroundColor Cyan
    Invoke-Expression (Invoke-RestMethod -UseBasicParsing "https://claude.ai/install.ps1")
    Update-SessionPath
}

Write-Host "Setting COLORTERM=truecolor" -ForegroundColor Cyan
try {
    [Environment]::SetEnvironmentVariable("COLORTERM", "truecolor", "Machine")
} catch {
    [Environment]::SetEnvironmentVariable("COLORTERM", "truecolor", "User")
}
$env:COLORTERM = "truecolor"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git not found, installing..." -ForegroundColor Cyan
    $gitAsset = (Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/git-for-windows/git/releases/latest").assets |
        Where-Object { $_.name -like "*-64-bit.exe" } | Select-Object -First 1
    $gitInstaller = Join-Path ([IO.Path]::GetTempPath()) $gitAsset.name
    Invoke-WebRequest -UseBasicParsing $gitAsset.browser_download_url -OutFile $gitInstaller
    Start-Process $gitInstaller -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /GitAndUnixToolsOnPath /NoShellIntegration /NoGuiHereIntegration /DefaultBranchName:main" -Wait
    Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue
    Update-SessionPath
}

Require-Command "git"

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitRoot = Split-Path (Split-Path $gitCmd.Source -Parent) -Parent
    $gitBash = Join-Path $gitRoot "bin\bash.exe"
    if (Test-Path $gitBash) {
        Write-Host "Setting CLAUDE_CODE_GIT_BASH_PATH=$gitBash" -ForegroundColor Cyan
        try {
            [Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", $gitBash, "Machine")
        } catch {
            [Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", $gitBash, "User")
        }
        $env:CLAUDE_CODE_GIT_BASH_PATH = $gitBash
    }
}

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) "claude-code-config-$PID"
try {
    Write-Host "Cloning $ConfigRepository..." -ForegroundColor Cyan
    git clone --depth 1 $ConfigRepository $tmpDir 2>&1 | Out-Null

    New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null

    foreach ($file in $Files) {
        $dest = Join-Path $ClaudeDir $file
        $src = Join-Path $tmpDir $file
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Copy-Item -LiteralPath $src -Destination $dest -Force
        Write-Host "  Installed $file" -ForegroundColor Green
    }

    Write-Host "`nDone. Config installed to $ClaudeDir" -ForegroundColor Green
} finally {
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
