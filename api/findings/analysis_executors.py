"""Per-check executor functions for malware analysis findings.

Each executor takes (storage, sample, finding) and returns the populated
description_md string.  They are pure functions — side-effect free except
for reading sample bytes from storage.
"""

import hashlib
import re

# Match printable ASCII runs of 4+ chars in raw bytes.
_STRINGS_RE = re.compile(rb'[\x20-\x7e]{4,}')

MAX_STRINGS = 500
MAX_STRING_LENGTH = 200


def execute_hash_identification(storage, sample, finding):
    """Compute MD5, SHA-1, SHA-256 hashes of the sample file."""
    md5 = hashlib.md5()
    sha1 = hashlib.sha1()
    sha256 = hashlib.sha256()

    f = storage.open(sample.storage_uri)
    try:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            md5.update(chunk)
            sha1.update(chunk)
            sha256.update(chunk)
    finally:
        f.close()

    filename = sample.original_filename
    return (
        f'## File Hashes — {filename}\n\n'
        f'| Algorithm | Hash |\n'
        f'|-----------|------|\n'
        f'| MD5 | `{md5.hexdigest()}` |\n'
        f'| SHA-1 | `{sha1.hexdigest()}` |\n'
        f'| SHA-256 | `{sha256.hexdigest()}` |\n'
    )


def execute_extract_strings(storage, sample, finding):
    """Extract printable ASCII strings (> 4 chars) from the sample file."""
    f = storage.open(sample.storage_uri)
    try:
        data = f.read()
    finally:
        f.close()

    matches = _STRINGS_RE.findall(data)
    strings = [m.decode('ascii', errors='replace') for m in matches]
    filename = sample.original_filename

    if strings:
        truncated = len(strings) > MAX_STRINGS
        display_strings = strings[:MAX_STRINGS]
        lines = '\n'.join(s[:MAX_STRING_LENGTH] for s in display_strings)
        description = (
            f'## Extracted Strings — {filename}\n\n'
            f'Found **{len(strings)}** printable strings (> 4 characters).'
        )
        if truncated:
            description += f' Showing first {MAX_STRINGS}.'
        description += f'\n\n```\n{lines}\n```\n'
    else:
        description = (
            f'## Extracted Strings — {filename}\n\n'
            f'No printable strings longer than 4 characters were found.'
        )

    return description


# Registry mapping check key → executor function.
EXECUTORS = {
    'hash_identification': execute_hash_identification,
    'extract_strings': execute_extract_strings,
}
