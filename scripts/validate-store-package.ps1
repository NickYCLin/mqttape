param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [ValidateSet('x64', 'arm64')]
  [string]$ExpectedArchitecture
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$file = Get-Item -LiteralPath $resolvedPath
if ($file.Length -lt 1MB) {
  throw "Store package is unexpectedly small: $resolvedPath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-StoreVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Context
  )

  if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)\.(\d+)$') {
    throw "$Context version must use four numeric parts: $Version"
  }
  $parts = @($Matches[1..4] | ForEach-Object { [uint32]$_ })
  if ($parts | Where-Object { $_ -gt 65535 }) {
    throw "$Context version contains a value above 65535: $Version"
  }
  if ($parts[0] -eq 0) {
    throw "$Context version major must be greater than zero for Microsoft Store: $Version"
  }
  if ($parts[3] -ne 0) {
    throw "$Context version revision must be zero for Microsoft Store: $Version"
  }
}

$archive = [IO.Compression.ZipFile]::OpenRead($resolvedPath)
try {
  if ($file.Extension -eq '.msix') {
    $manifestEntry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $manifestEntry) {
      throw "AppxManifest.xml is missing from $resolvedPath"
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
    if ($null -eq $identity -or
      [string]::IsNullOrWhiteSpace($identity.GetAttribute('Name')) -or
      [string]::IsNullOrWhiteSpace($identity.GetAttribute('Publisher'))) {
      throw "Package identity is incomplete in $resolvedPath"
    }
    Assert-StoreVersion -Version $identity.GetAttribute('Version') -Context 'MSIX'
    $architecture = $identity.GetAttribute('ProcessorArchitecture')
    if ($ExpectedArchitecture -and $architecture -ne $ExpectedArchitecture) {
      throw "Expected $ExpectedArchitecture package, manifest contains $architecture."
    }

    $requiredEntries = @(
      'app/MQTTape.exe',
      'assets/StoreLogo.png',
      'assets/Square44x44Logo.png',
      'assets/Square150x150Logo.png',
      'assets/Wide310x150Logo.png'
    )
    foreach ($entryName in $requiredEntries) {
      if ($null -eq $archive.GetEntry($entryName)) {
        throw "$entryName is missing from $resolvedPath"
      }
    }

    Write-Host "Validated $architecture MSIX: $resolvedPath"
    return
  }

  if ($file.Extension -eq '.msixbundle') {
    $manifestEntry = $archive.GetEntry('AppxMetadata/AppxBundleManifest.xml')
    if ($null -eq $manifestEntry) {
      throw "AppxBundleManifest.xml is missing from $resolvedPath"
    }

    $reader = [IO.StreamReader]::new($manifestEntry.Open())
    try {
      [xml]$manifest = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }

    $namespace = [Xml.XmlNamespaceManager]::new($manifest.NameTable)
    $namespace.AddNamespace('bundle', 'http://schemas.microsoft.com/appx/2013/bundle')
    $identity = $manifest.SelectSingleNode('/bundle:Bundle/bundle:Identity', $namespace)
    if ($null -eq $identity -or
      [string]::IsNullOrWhiteSpace($identity.GetAttribute('Name')) -or
      [string]::IsNullOrWhiteSpace($identity.GetAttribute('Publisher'))) {
      throw "Bundle identity is incomplete in $resolvedPath"
    }
    $bundleVersion = $identity.GetAttribute('Version')
    Assert-StoreVersion -Version $bundleVersion -Context 'MSIX bundle'
    $bundlePackages = @(
      $manifest.SelectNodes('/bundle:Bundle/bundle:Packages/bundle:Package', $namespace)
    )
    $architectures = @(
      $bundlePackages |
        ForEach-Object { $_.GetAttribute('Architecture') } |
        Sort-Object -Unique
    )
    if (($architectures -join ',') -ne 'arm64,x64') {
      throw "Expected x64 and ARM64 bundle packages, found: $($architectures -join ', ')."
    }
    $packageEntries = @($archive.Entries | Where-Object FullName -Match '\.msix$')
    if ($packageEntries.Count -ne 2) {
      throw "Expected two embedded MSIX packages, found $($packageEntries.Count)."
    }
    foreach ($package in $bundlePackages) {
      if ($package.GetAttribute('Version') -ne $bundleVersion) {
        throw "Bundle and embedded package versions differ: $bundleVersion and $($package.GetAttribute('Version'))."
      }
    }

    Write-Host "Validated x64 and ARM64 MSIX bundle: $resolvedPath"
    return
  }

  throw "Unsupported Store package extension: $($file.Extension)"
} finally {
  $archive.Dispose()
}
