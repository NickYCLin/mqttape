param(
  [string]$ReleaseDirectory = 'release\store'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releasePath = if ([IO.Path]::IsPathRooted($ReleaseDirectory)) {
  [IO.Path]::GetFullPath($ReleaseDirectory)
} else {
  [IO.Path]::GetFullPath((Join-Path $projectRoot $ReleaseDirectory))
}

if (-not (Test-Path -LiteralPath $releasePath -PathType Container)) {
  throw "Store package directory was not found: $releasePath"
}

$projectPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $releasePath.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Release directory must stay inside the project: $releasePath"
}

$makeAppx = Get-Command makeappx.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $makeAppx) {
  $makeAppx = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName |
    Select-Object -Last 1
}
if ($null -eq $makeAppx) {
  throw 'MakeAppx.exe was not found. Install the Windows 10/11 SDK before building the Store bundle.'
}
$makeAppxPath = if ($makeAppx -is [IO.FileInfo]) { $makeAppx.FullName } else { $makeAppx.Source }

$packages = @(Get-ChildItem -LiteralPath $releasePath -File -Filter '*.msix')
$x64Packages = @($packages | Where-Object Name -Match '-x64\.msix$')
$arm64Packages = @($packages | Where-Object Name -Match '-arm64\.msix$')
if ($packages.Count -ne 2 -or $x64Packages.Count -ne 1 -or $arm64Packages.Count -ne 1) {
  throw "Expected one x64 and one ARM64 MSIX package, found: $($packages.Name -join ', ')"
}
foreach ($package in $packages) {
  if ($package.Length -lt 1MB) {
    throw "MSIX package is unexpectedly small: $($package.FullName)"
  }
}

function Get-PackageIdentity {
  param([Parameter(Mandatory = $true)][IO.FileInfo]$Package)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($Package.FullName)
  try {
    $manifestEntry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $manifestEntry) {
      throw "AppxManifest.xml is missing from $($Package.FullName)"
    }
    $reader = [IO.StreamReader]::new($manifestEntry.Open())
    try {
      [xml]$manifest = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
    $namespace = [Xml.XmlNamespaceManager]::new($manifest.NameTable)
    $namespace.AddNamespace('appx', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
    $identity = $manifest.SelectSingleNode('/appx:Package/appx:Identity', $namespace)
    if ($null -eq $identity) {
      throw "Package identity is missing from $($Package.FullName)"
    }
    return [pscustomobject]@{
      Name = $identity.GetAttribute('Name')
      Publisher = $identity.GetAttribute('Publisher')
      Version = $identity.GetAttribute('Version')
    }
  } finally {
    $archive.Dispose()
  }
}

$validatorPath = Join-Path $PSScriptRoot 'validate-store-package.ps1'
& $validatorPath -Path $x64Packages[0].FullName -ExpectedArchitecture x64
& $validatorPath -Path $arm64Packages[0].FullName -ExpectedArchitecture arm64

$x64Identity = Get-PackageIdentity -Package $x64Packages[0]
$arm64Identity = Get-PackageIdentity -Package $arm64Packages[0]
foreach ($field in @('Name', 'Publisher', 'Version')) {
  if ($x64Identity.$field -cne $arm64Identity.$field) {
    throw "x64 and ARM64 package identities differ for ${field}: '$($x64Identity.$field)' and '$($arm64Identity.$field)'."
  }
}

$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$bundlePath = Join-Path $releasePath "MQTTape-$($packageJson.version)-store.msixbundle"
$mappingPath = Join-Path $releasePath 'bundle-mapping.txt'
$mappingLines = @(
  '[Files]',
  ('"{0}" "{1}"' -f $x64Packages[0].FullName, $x64Packages[0].Name),
  ('"{0}" "{1}"' -f $arm64Packages[0].FullName, $arm64Packages[0].Name)
)
[IO.File]::WriteAllText($mappingPath, ($mappingLines -join "`r`n"), [Text.UTF8Encoding]::new($false))

& $makeAppxPath bundle /o /bv $x64Identity.Version /f $mappingPath /p $bundlePath
if ($LASTEXITCODE -ne 0) {
  throw "MakeAppx.exe failed with exit code $LASTEXITCODE."
}
& $validatorPath -Path $bundlePath

Write-Host "Microsoft Store bundle created: $bundlePath"
