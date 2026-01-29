# Phase 2 Clip Detection Test Script
# Usage: .\test-clips.ps1 -JobId "your-job-id"

param(
    [Parameter(Mandatory = $true)]
    [string]$JobId,
    
    [Parameter(Mandatory = $false)]
    [int]$MaxClips = 10
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Phase 2: Clip Detection Test" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Analyze clips
Write-Host "Step 1: Analyzing clips for job $JobId..." -ForegroundColor Yellow
Write-Host ""

$analyzeBody = @{
    jobId    = $JobId
    maxClips = $MaxClips
} | ConvertTo-Json

try {
    $analyzeResult = Invoke-RestMethod -Uri "http://localhost:3001/api/clips/analyze" `
        -Method POST `
        -ContentType "application/json" `
        -Body $analyzeBody
    
    Write-Host "✓ Analysis complete!" -ForegroundColor Green
    Write-Host "  Found $($analyzeResult.selectedCount) clips" -ForegroundColor Green
    Write-Host ""
    
    # Show clip details
    Write-Host "Clip Candidates:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $analyzeResult.candidates.Count; $i++) {
        $clip = $analyzeResult.candidates[$i]
        Write-Host "  [$i] Score: $($clip.score.total)/100 | Duration: $([math]::Round($clip.duration, 1))s | Keywords: $($clip.score.keywords -join ', ')" -ForegroundColor White
        Write-Host "      Time: $([math]::Round($clip.startTime, 1))s - $([math]::Round($clip.endTime, 1))s" -ForegroundColor Gray
        Write-Host "      Text: $($clip.text.Substring(0, [Math]::Min(80, $clip.text.Length)))..." -ForegroundColor Gray
        Write-Host ""
    }
    
}
catch {
    Write-Host "✗ Analysis failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Render clips
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
$response = Read-Host "Do you want to render these clips? (y/n)"

if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host ""
    Write-Host "Step 2: Rendering clips..." -ForegroundColor Yellow
    Write-Host ""
    
    $renderBody = @{
        jobId    = $JobId
        maxClips = $MaxClips
    } | ConvertTo-Json
    
    try {
        $renderResult = Invoke-RestMethod -Uri "http://localhost:3001/api/clips/render" `
            -Method POST `
            -ContentType "application/json" `
            -Body $renderBody
        
        Write-Host "✓ Rendering complete!" -ForegroundColor Green
        Write-Host "  Generated $($renderResult.count) clips" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "Generated Clips:" -ForegroundColor Cyan
        foreach ($clip in $renderResult.clips) {
            Write-Host "  - $($clip.videoPath)" -ForegroundColor White
        }
        Write-Host ""
        Write-Host "Clips saved to: backend\storage\clips\" -ForegroundColor Yellow
        
    }
    catch {
        Write-Host "✗ Rendering failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "Skipped rendering." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "✓ Test Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
