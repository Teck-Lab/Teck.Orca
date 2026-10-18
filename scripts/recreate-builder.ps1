param([ValidatePattern('^[1-9][0-9]*g$')][string]$VolumeSize = '40g')
$ErrorActionPreference = 'Stop'

# Run explicitly to replace the shared builder/cache. This is never invoked by
# setup or the recipe. Existing project sandboxes are not removed.
Write-Host "Replacing sbx-kit-builder and its build cache with a $VolumeSize Docker volume."
& sbx kit builder rm --force
if ($LASTEXITCODE -ne 0) { throw 'Could not remove the shared kit builder.' }
& sbx create --no-progress --name sbx-kit-builder --skills off --kit-arg "volumeSize=$VolumeSize" docker.io/docker/sbx-kit-builder:1
if ($LASTEXITCODE -ne 0) { throw 'Builder recreation failed; inspect sbx kit builder status before retrying.' }
& sbx run --detach --name sbx-kit-builder
if ($LASTEXITCODE -ne 0) { throw 'Could not keep the builder running in detached mode.' }
& sbx exec -u root sbx-kit-builder df -B1 /var/lib/docker
if ($LASTEXITCODE -ne 0) { throw 'Could not verify the recreated builder volume.' }
& sbx kit builder status
exit $LASTEXITCODE
