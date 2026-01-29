# FFmpeg Installation Fix Script

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "FFmpeg Installation Verification" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if FFmpeg exists in the expected location
$ffmpegPath = "C:\ffmpeg\ffmpeg-8.0.1-essentials_build\ffmpeg-8.0.1-essentials_build\bin"

if (Test-Path "$ffmpegPath\ffmpeg.exe") {
    Write-Host "✓ FFmpeg found at: $ffmpegPath" -ForegroundColor Green
    
    # Check if it's in PATH
    $envPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    
    if ($envPath -like "*$ffmpegPath*") {
        Write-Host "✓ FFmpeg is in System PATH" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠ You need to RESTART PowerShell for changes to take effect!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "After restarting PowerShell, run: ffmpeg -version" -ForegroundColor Cyan
    } else {
        Write-Host "✗ FFmpeg is NOT in System PATH" -ForegroundColor Red
        Write-Host ""
        Write-Host "To add FFmpeg to PATH:" -ForegroundColor Yellow
        Write-Host "1. Press Win + X → System" -ForegroundColor White
        Write-Host "2. Click 'Advanced system settings'" -ForegroundColor White
        Write-Host "3. Click 'Environment Variables'" -ForegroundColor White
        Write-Host "4. Under 'System variables', select 'Path' → Edit" -ForegroundColor White
        Write-Host "5. Click 'New' and add:" -ForegroundColor White
        Write-Host "   $ffmpegPath" -ForegroundColor Cyan
        Write-Host "6. Click OK on all dialogs" -ForegroundColor White
        Write-Host "7. RESTART PowerShell" -ForegroundColor White
    }
} else {
    Write-Host "✗ FFmpeg not found at expected location" -ForegroundColor Red
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan

# Try to run FFmpeg directly from the bin folder
Write-Host ""
Write-Host "Testing FFmpeg directly from bin folder..." -ForegroundColor Cyan
& "$ffmpegPath\ffmpeg.exe" -version 2>&1 | Select-Object -First 3
