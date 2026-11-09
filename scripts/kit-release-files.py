"""Inventory a Buildx root-filesystem tar stream without extracting image files."""
import argparse
import hashlib
import json
import sys
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True)
parser.add_argument('--platform', required=True, choices=['linux/amd64', 'linux/arm64'])
parser.add_argument('--digest', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
entries = {}
with tarfile.open(fileobj=sys.stdin.buffer, mode='r|*') as archive:
    for item in archive:
        name = item.name.removeprefix('./').rstrip('/')
        if not name or name == '.':
            continue
        if name.startswith('/') or '\\' in name or any(part in ['', '.', '..'] for part in name.split('/')):
            raise ValueError('Unsafe image archive path')
        if name in entries:
            raise ValueError('Duplicate image archive path: ' + name)
        if len(entries) >= 500000:
            raise ValueError('Image file inventory exceeds limit')
        value = {'mode': item.mode, 'uid': item.uid, 'gid': item.gid}
        if item.isdir():
            value['type'] = 'directory'
        elif item.isfile():
            value['type'] = 'file'
            digest = hashlib.sha256()
            with archive.extractfile(item) as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            value['digest'] = 'sha256:' + digest.hexdigest()
        elif item.issym() or item.islnk():
            value.update(type='symlink' if item.issym() else 'hardlink', target=item.linkname)
        else:
            raise ValueError('Unsupported special image entry: ' + name)
        entries[name] = value
with open(args.out, 'w', encoding='utf-8') as output:
    json.dump({'schemaVersion': 1, 'name': args.name, 'platform': args.platform, 'digest': args.digest, 'entries': entries}, output, sort_keys=True)
    output.write('\n')
