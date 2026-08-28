# Deploys this module into the local Foundry VTT v14 modules folder.
# There is no build step: the module is plain JSON + a small script, so
# "compiling" just means copying the tracked files into place.

param(
    [string]$Target = "D:\Foundry VTT\v14\LocalData\Data\modules\pf2eja"
)

$ErrorActionPreference = "Stop"
$src = $PSScriptRoot

New-Item -ItemType Directory -Force -Path $Target | Out-Null

# Clear previously deployed content (but keep the folder itself)
Get-ChildItem -Path $Target -Force | Remove-Item -Recurse -Force

foreach ($item in @("module.json", "register-babele.js", "lang", "compendium", "Readme.md")) {
    $path = Join-Path $src $item
    if (Test-Path $path) {
        Copy-Item -Path $path -Destination $Target -Recurse -Force
    }
}

Write-Host "Deployed pf2eja -> $Target"
