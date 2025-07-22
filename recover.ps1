# Restore-GitLostObjects.ps1
# Recovers dangling commits and blobs found via `git fsck`

param(
    [string]$RecoveryDir = ".\git-recovery"
)

# Ensure git is available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in PATH."
    exit 1
}

# Create recovery folder
if (-not (Test-Path $RecoveryDir)) {
    New-Item -ItemType Directory -Path $RecoveryDir | Out-Null
}

# Run git fsck to find dangling objects
Write-Output "Scanning for lost git objects..."
$fsckOutput = git fsck --lost-found

# Extract dangling commits
$danglingCommits = $fsckOutput | Select-String 'dangling commit ([a-f0-9]{40})' | ForEach-Object {
    $_.Matches[0].Groups[1].Value
}

# Extract dangling blobs
$danglingBlobs = $fsckOutput | Select-String 'dangling blob ([a-f0-9]{40})' | ForEach-Object {
    $_.Matches[0].Groups[1].Value
}

# Restore dangling commits to a branch
$index = 0
foreach ($commit in $danglingCommits) {
    $branchName = "recovered/commit-$index"
    git branch $branchName $commit
    Write-Output "Recovered commit: $commit ? branch '$branchName'"
    $index++
}

# Save dangling blobs to files
$blobIndex = 0
foreach ($blob in $danglingBlobs) {
    $filePath = Join-Path $RecoveryDir "blob-$blobIndex.txt"
    git show $blob > $filePath
    Write-Output "Recovered blob: $blob ? $filePath"
    $blobIndex++
}

Write-Output "`n? Recovery complete. Check:"
Write-Output " - Recovered branches: use 'git checkout recovered/commit-X'"
Write-Output " - Blobs saved to: $RecoveryDir"
