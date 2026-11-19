$Host.UI.RawUI.WindowTitle = "BLUFF! Monitor"

# Hide cursor
[Console]::CursorVisible = $false

try {
    while ($true) {
        $cpu = (Get-CimInstance Win32_Processor |
            Measure-Object -Property LoadPercentage -Average).Average

        $os = Get-CimInstance Win32_OperatingSystem

        $total = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
        $free  = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
        $used  = [math]::Round($total - $free, 1)
        $ramPercent = [math]::Round(($used / $total) * 100)

        $nodes = Get-Process node -ErrorAction SilentlyContinue

        $nodeRam = 0

        if ($nodes) {
            $nodeRam = [math]::Round(
                ($nodes | Measure-Object WorkingSet64 -Sum).Sum / 1MB,
                1
            )
        }

        # Move cursor to top instead of clearing screen
        [Console]::SetCursorPosition(0, 0)

        Write-Host "============================================"
        Write-Host "           BLUFF! SERVER MONITOR             "
        Write-Host "============================================"
        Write-Host ""

        Write-Host ("SYSTEM CPU     : {0,5}%" -f $cpu)
        Write-Host ("SYSTEM RAM     : {0,5} GB / {1} GB ({2}%)" -f $used, $total, $ramPercent)
        Write-Host ""
        Write-Host ("NODE RAM       : {0,5} MB" -f $nodeRam)
        Write-Host ("NODE PROCESSES : {0,5}" -f @($nodes).Count)

        Write-Host ""
        Write-Host "--------------------------------------------"
        Write-Host " Refresh: 2 sec     Ctrl+C to close monitor "
        Write-Host "--------------------------------------------"

        Start-Sleep -Seconds 2
    }
}
finally {
    [Console]::CursorVisible = $true
}