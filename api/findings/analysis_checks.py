"""Analysis check registry — defines placeholder findings for malware analysis.

Each entry describes a check that can be seeded as a placeholder finding and
executed on demand.  Adding a new check = adding one dict to ANALYSIS_CHECKS.
"""

ANALYSIS_CHECKS = [
    {
        'key': 'hash_identification',
        'title': 'File Hash Identification',
        'description_placeholder': '*Pending execution.* Click **Execute** to generate file hashes.',
        'analysis_type': 'static',
    },
    {
        'key': 'extract_strings',
        'title': 'Extract Strings',
        'description_placeholder': '*Pending execution.* Click **Execute** to extract printable strings.',
        'analysis_type': 'static',
    },
    {
        'key': 'special_strings',
        'title': 'Special Strings',
        'description_placeholder': '*Pending execution.* Click **Execute** to identify email addresses, phone numbers, IP addresses, and URLs.',
        'analysis_type': 'static',
    },
]

# Keyed lookup for fast access by check key.
ANALYSIS_CHECKS_BY_KEY = {c['key']: c for c in ANALYSIS_CHECKS}
