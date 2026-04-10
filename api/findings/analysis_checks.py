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
    {
        'key': 'file_type',
        'title': 'File Type',
        'description_placeholder': '*Pending execution.* Click **Execute** to identify file type, MIME type, and format details.',
        'analysis_type': 'static',
    },
    {
        'key': 'pe_headers',
        'title': 'PE Headers',
        'description_placeholder': '*Pending execution.* Click **Execute** to parse PE headers (machine type, compile timestamp, entry point, subsystem).',
        'analysis_type': 'static',
    },
    {
        'key': 'pe_sections',
        'title': 'PE Sections',
        'description_placeholder': '*Pending execution.* Click **Execute** to analyse PE sections (sizes, entropy, permissions, anomalies).',
        'analysis_type': 'static',
    },
    {
        'key': 'pe_imports',
        'title': 'PE Imports & Suspicious APIs',
        'description_placeholder': '*Pending execution.* Click **Execute** to list imported DLLs/functions and flag suspicious API calls.',
        'analysis_type': 'static',
    },
    {
        'key': 'pe_exports',
        'title': 'PE Exports',
        'description_placeholder': '*Pending execution.* Click **Execute** to list exported functions.',
        'analysis_type': 'static',
    },
    {
        'key': 'pe_packer_detection',
        'title': 'Packer Detection',
        'description_placeholder': '*Pending execution.* Click **Execute** to check for packing, high entropy, and known packer signatures.',
        'analysis_type': 'static',
    },
    {
        'key': 'pe_resources',
        'title': 'PE Resources & Version Info',
        'description_placeholder': '*Pending execution.* Click **Execute** to extract embedded resources, version strings, PDB paths, and manifest info.',
        'analysis_type': 'static',
    },
    {
        'key': 'compile_time',
        'title': 'Compile Time',
        'description_placeholder': '*Pending execution.* Click **Execute** to extract and analyse the PE compile timestamp for anomalies or timestomping.',
        'analysis_type': 'static',
    },
]

# Keyed lookup for fast access by check key.
ANALYSIS_CHECKS_BY_KEY = {c['key']: c for c in ANALYSIS_CHECKS}
