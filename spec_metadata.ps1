# Set error handling
$ErrorActionPreference = "Stop"

# Collect metadata
$DATETIME_TZ = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
$FILENAME_TS = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# Check for Git and if inside a repository
try {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $repoRoot = git rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -eq 0) {
            $REPO_ROOT = $repoRoot
            $REPO_NAME = Split-Path -Leaf $REPO_ROOT
            $GIT_BRANCH = git rev-parse --abbrev-ref HEAD
            $GIT_COMMIT = git rev-parse HEAD
            # Fetch git user information
            $GIT_USER_NAME = git config user.name
            $GIT_USER_EMAIL = git config user.email
        }
    }
}
catch {
    # Git not found or not in a repo, variables remain null
}

# Print output
Write-Host "Current Date/Time (TZ): $DATETIME_TZ"
if ($GIT_COMMIT) {
    Write-Host "Current Git Commit Hash: $GIT_COMMIT"
}
if ($GIT_BRANCH) {
    Write-Host "Current Branch Name: $GIT_BRANCH"
}
if ($REPO_NAME) {
    Write-Host "Repository Name: $REPO_NAME"
}
if ($GIT_USER_NAME) {
    Write-Host "Git User Name: $GIT_USER_NAME"
}
if ($GIT_USER_EMAIL) {
    Write-Host "Git User Email: $GIT_USER_EMAIL"
}
Write-Host "Timestamp For Filename: $FILENAME_TS"