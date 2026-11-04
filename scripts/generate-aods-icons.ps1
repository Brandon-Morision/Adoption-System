<#
.SYNOPSIS
    Generates official AODS Shield Emblem icon assets:
    - public/favicon.svg
    - public/favicon.ico (16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256)
    - public/aods.ico
    - public/apple-touch-icon.png (180x180)
    - public/icon-192.png
    - public/icon-512.png
    - deployment/icons/aods.ico
    - deployment/workstation-package/aods.ico
#>

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PublicDir = Join-Path $ProjectRoot "public"
$DeployIconsDir = Join-Path $ProjectRoot "deployment\icons"
$WorkstationPkgDir = Join-Path $ProjectRoot "deployment\workstation-package"

if (-not (Test-Path $DeployIconsDir)) { New-Item -Path $DeployIconsDir -ItemType Directory -Force | Out-Null }
if (-not (Test-Path $WorkstationPkgDir)) { New-Item -Path $WorkstationPkgDir -ItemType Directory -Force | Out-Null }

# 1. Write public/favicon.svg
$svgContent = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f2b4f" />
      <stop offset="100%" stop-color="#07172c" />
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#317bc8" />
      <stop offset="100%" stop-color="#15477d" />
    </linearGradient>
  </defs>
  <!-- Background rounded plate -->
  <rect width="32" height="32" rx="7" fill="url(#bg)" />
  <!-- Outer subtle border -->
  <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="none" stroke="#2566ab" stroke-width="1" stroke-opacity="0.35" />
  <!-- Shield emblem border and fill -->
  <path d="M16 26.5s7.5-3.8 7.5-9.4V8.5l-7.5-3-7.5 3v8.6c0 5.6 7.5 9.4 7.5 9.4Z" 
        fill="url(#shieldGrad)" stroke="#68a9e7" stroke-width="1.2" stroke-linejoin="round" />
  <!-- Checkmark -->
  <path d="m13 16 2.2 2.2 4.3-4.8" 
        fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
'@

Set-Content -Path (Join-Path $PublicDir "favicon.svg") -Value $svgContent -Encoding UTF8
Write-Host "[OK] Created public/favicon.svg" -ForegroundColor Green

# 2. Draw Multi-Resolution Icons via .NET System.Drawing
Add-Type -AssemblyName System.Drawing

function Render-ShieldBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Clear transparent
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 32.0

    # Draw rounded rectangle background plate
    $cornerRad = [Math]::Max(2.0, 7.0 * $scale)
    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bgPath.AddArc($rect.X, $rect.Y, ($cornerRad * 2), ($cornerRad * 2), 180, 90)
    $bgPath.AddArc(($rect.Right - ($cornerRad * 2)), $rect.Y, ($cornerRad * 2), ($cornerRad * 2), 270, 90)
    $bgPath.AddArc(($rect.Right - ($cornerRad * 2)), ($rect.Bottom - ($cornerRad * 2)), ($cornerRad * 2), ($cornerRad * 2), 0, 90)
    $bgPath.AddArc($rect.X, ($rect.Bottom - ($cornerRad * 2)), ($cornerRad * 2), ($cornerRad * 2), 90, 90)
    $bgPath.CloseFigure()

    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF 0, $size), ([System.Drawing.Color]::FromArgb(255, 15, 43, 79)), ([System.Drawing.Color]::FromArgb(255, 7, 23, 44))
    $g.FillPath($bgBrush, $bgPath)

    # Plate border
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 104, 169, 231)), ([Math]::Max(1.0, 1.0 * $scale))
    $g.DrawPath($borderPen, $bgPath)

    # Shield geometry scaled to size
    $shieldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    # Scaled coordinates corresponding to: M16 26.5s7.5-3.8 7.5-9.4V8.5l-7.5-3-7.5 3v8.6c0 5.6 7.5 9.4 7.5 9.4Z
    $pTop = New-Object System.Drawing.PointF (16.0 * $scale), (5.5 * $scale)
    $pRightTop = New-Object System.Drawing.PointF (23.5 * $scale), (8.5 * $scale)
    $pRightMid = New-Object System.Drawing.PointF (23.5 * $scale), (17.1 * $scale)
    $pBottom = New-Object System.Drawing.PointF (16.0 * $scale), (26.5 * $scale)
    $pLeftMid = New-Object System.Drawing.PointF (8.5 * $scale), (17.1 * $scale)
    $pLeftTop = New-Object System.Drawing.PointF (8.5 * $scale), (8.5 * $scale)

    $shieldPath.AddLine($pTop, $pRightTop)
    $shieldPath.AddLine($pRightTop, $pRightMid)
    # Curve to bottom point
    $shieldPath.AddBezier($pRightMid, (New-Object System.Drawing.PointF (23.5 * $scale), (22.7 * $scale)), (New-Object System.Drawing.PointF (19.0 * $scale), (25.5 * $scale)), $pBottom)
    # Curve from bottom to left
    $shieldPath.AddBezier($pBottom, (New-Object System.Drawing.PointF (13.0 * $scale), (25.5 * $scale)), (New-Object System.Drawing.PointF (8.5 * $scale), (22.7 * $scale)), $pLeftMid)
    $shieldPath.AddLine($pLeftMid, $pLeftTop)
    $shieldPath.CloseFigure()

    $shieldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, (5.5 * $scale)), (New-Object System.Drawing.PointF 0, (26.5 * $scale)), ([System.Drawing.Color]::FromArgb(255, 49, 123, 200)), ([System.Drawing.Color]::FromArgb(255, 21, 71, 125))
    $g.FillPath($shieldBrush, $shieldPath)

    $shieldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 104, 169, 231)), ([Math]::Max(1.0, 1.2 * $scale))
    $shieldPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($shieldPen, $shieldPath)

    # Checkmark: m13 16 2.2 2.2 4.3-4.8 -> (13,16) to (15.2, 18.2) to (19.5, 13.4)
    $checkPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cp1 = New-Object System.Drawing.PointF (12.8 * $scale), (15.8 * $scale)
    $cp2 = New-Object System.Drawing.PointF (15.2 * $scale), (18.4 * $scale)
    $cp3 = New-Object System.Drawing.PointF (19.8 * $scale), (13.2 * $scale)
    $checkPath.AddLine($cp1, $cp2)
    $checkPath.AddLine($cp2, $cp3)

    $checkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, 2.2 * $scale))
    $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($checkPen, $checkPath)

    $g.Dispose()
    return $bmp
}

# 3. Build Multi-Resolution ICO File
$iconSizes = @(16, 24, 32, 48, 64, 128, 256)
$pngStreams = @()

foreach ($sz in $iconSizes) {
    $bmp = Render-ShieldBitmap $sz
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngStreams += @{
        Size = $sz
        Bytes = $ms.ToArray()
    }
    $ms.Dispose()
}

# Generate PNG files for web
$png180 = Render-ShieldBitmap 180
$png180.Save((Join-Path $PublicDir "apple-touch-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$png180.Dispose()

$png192 = Render-ShieldBitmap 192
$png192.Save((Join-Path $PublicDir "icon-192.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$png192.Dispose()

$png512 = Render-ShieldBitmap 512
$png512.Save((Join-Path $PublicDir "icon-512.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$png512.Dispose()

Write-Host "[OK] Generated PNG icon formats (180px, 192px, 512px)." -ForegroundColor Green

# Package into ICO file stream
function Export-IcoFile([string]$destinationPath) {
    $fs = New-Object System.IO.FileStream $destinationPath, ([System.IO.FileMode]::Create), ([System.IO.FileAccess]::Write)
    $bw = New-Object System.IO.BinaryWriter $fs

    # Header
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type (1 = Icon)
    $bw.Write([uint16]$pngStreams.Count) # Count of images

    # Offset to image data = 6 (header) + count * 16 (dir entries)
    $dataOffset = 6 + ($pngStreams.Count * 16)

    foreach ($item in $pngStreams) {
        $w = if ($item.Size -eq 256) { 0 } else { [byte]$item.Size }
        $h = if ($item.Size -eq 256) { 0 } else { [byte]$item.Size }
        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0)   # Color count
        $bw.Write([byte]0)   # Reserved
        $bw.Write([uint16]1) # Color planes
        $bw.Write([uint16]32)# Bit count (32bpp)
        $bw.Write([uint32]$item.Bytes.Length)
        $bw.Write([uint32]$dataOffset)
        $dataOffset += $item.Bytes.Length
    }

    # Write Image Data
    foreach ($item in $pngStreams) {
        $bw.Write($item.Bytes)
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
    Write-Host "[OK] Saved Multi-Resolution ICO: $destinationPath" -ForegroundColor Green
}

Export-IcoFile (Join-Path $PublicDir "favicon.ico")
Export-IcoFile (Join-Path $PublicDir "aods.ico")
Export-IcoFile (Join-Path $DeployIconsDir "aods.ico")
Export-IcoFile (Join-Path $WorkstationPkgDir "aods.ico")

