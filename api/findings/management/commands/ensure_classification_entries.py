"""Idempotent seed command for ClassificationEntry reference data.

Seeds assessment areas, OWASP Top 10, and CWE entries.
Safe to run on every deployment — uses bulk_create(ignore_conflicts=True).

Usage:
    python manage.py ensure_classification_entries
"""

from django.core.management.base import BaseCommand

from findings.models import ClassificationEntry

# Imported from migration 0006 — keep in sync.
ASSESSMENT_AREAS = [
    {
        'code': 'application_security',
        'name': 'Application Security',
        'description': (
            'Web application vulnerabilities including XSS, SQL injection, '
            'CSRF, IDOR, authentication bypass, and session management issues.'
        ),
    },
    {
        'code': 'network_security',
        'name': 'Network Security',
        'description': (
            'Network-level findings such as open ports, misconfigurations, '
            'man-in-the-middle risks, DNS issues, and firewall gaps.'
        ),
    },
    {
        'code': 'api_security',
        'name': 'API Security',
        'description': (
            'REST and GraphQL API issues including broken authentication, '
            'mass assignment, missing rate limiting, and data exposure.'
        ),
    },
    {
        'code': 'cloud_security',
        'name': 'Cloud Security',
        'description': (
            'Cloud infrastructure findings such as S3 bucket exposure, IAM '
            'misconfiguration, metadata SSRF, and security group issues.'
        ),
    },
    {
        'code': 'infrastructure_security',
        'name': 'Infrastructure Security',
        'description': (
            'Server and OS hardening issues including missing patches, '
            'default credentials, and exposed management interfaces.'
        ),
    },
    {
        'code': 'cryptography',
        'name': 'Cryptography',
        'description': (
            'Weak ciphers, TLS misconfiguration, insecure key storage, '
            'inadequate hashing algorithms, and certificate issues.'
        ),
    },
    {
        'code': 'auth_and_access_control',
        'name': 'Authentication & Access Control',
        'description': (
            'Weak password policies, MFA bypass, privilege escalation, '
            'broken access control, and identity management flaws.'
        ),
    },
    {
        'code': 'configuration_and_deployment',
        'name': 'Configuration & Deployment',
        'description': (
            'Debug mode enabled, verbose error messages, missing security '
            'headers, CORS misconfiguration, and insecure defaults.'
        ),
    },
    {
        'code': 'mobile_security',
        'name': 'Mobile Security',
        'description': (
            'Mobile application issues including insecure local storage, '
            'certificate pinning bypass, and hardcoded secrets.'
        ),
    },
    {
        'code': 'social_engineering',
        'name': 'Social Engineering',
        'description': (
            'Phishing, pretexting, vishing, and other human-factor attack '
            'vectors tested during red team engagements.'
        ),
    },
    {
        'code': 'physical_security',
        'name': 'Physical Security',
        'description': (
            'Physical access control findings such as tailgating, badge '
            'cloning, and unlocked workstations.'
        ),
    },
    {
        'code': 'compliance',
        'name': 'Compliance',
        'description': (
            'Regulatory and standards gaps including PCI-DSS, HIPAA, SOC 2, '
            'GDPR, and other framework violations.'
        ),
    },
]

OWASP_TOP_10 = [
    # --- OWASP Top 10:2025 ---
    {
        'code': 'A01:2025',
        'name': 'Broken Access Control',
        'description': (
            'Failures where users can act outside their intended permissions, '
            'resulting in unauthorized access to data or functions. Includes '
            'parameter tampering, privilege escalation, and IDOR.'
        ),
    },
    {
        'code': 'A02:2025',
        'name': 'Security Misconfiguration',
        'description': (
            'Vulnerabilities from improperly configured systems, applications, '
            'or cloud services. Includes disabled security features, unchanged '
            'default credentials, and unnecessary enabled services.'
        ),
    },
    {
        'code': 'A03:2025',
        'name': 'Software Supply Chain Failures',
        'description': (
            'Vulnerabilities and compromises in building, distributing, and '
            'updating software. Includes risks from third-party dependencies, '
            'unmaintained components, and malicious supply chain changes.'
        ),
    },
    {
        'code': 'A04:2025',
        'name': 'Cryptographic Failures',
        'description': (
            'Failures related to lack of cryptography, insufficiently strong '
            'cryptography, or leaking of cryptographic keys. Includes weak '
            'algorithms, improper key management, and unencrypted data.'
        ),
    },
    {
        'code': 'A05:2025',
        'name': 'Injection',
        'description': (
            'Untrusted user input sent to an interpreter causing execution of '
            'unintended commands. Includes SQL injection, XSS, OS command '
            'injection, and similar input validation flaws.'
        ),
    },
    {
        'code': 'A06:2025',
        'name': 'Insecure Design',
        'description': (
            'Weaknesses from flawed design and architecture rather than '
            'implementation errors. Emphasizes threat modeling, secure design '
            'patterns, and secure development lifecycle.'
        ),
    },
    {
        'code': 'A07:2025',
        'name': 'Authentication Failures',
        'description': (
            'Vulnerabilities allowing attackers to trick systems into '
            'recognizing invalid users. Includes credential stuffing, weak '
            'passwords, missing MFA, and improper session management.'
        ),
    },
    {
        'code': 'A08:2025',
        'name': 'Software or Data Integrity Failures',
        'description': (
            'Failures to verify integrity of software, code, and data. '
            'Includes risks from untrusted sources, insecure CI/CD pipelines, '
            'and unsafe deserialization of untrusted data.'
        ),
    },
    {
        'code': 'A09:2025',
        'name': 'Security Logging and Alerting Failures',
        'description': (
            'Failures in security logging and alerting that prevent detection '
            'and response to attacks. Includes insufficient logging, inadequate '
            'monitoring, and missing alerts for critical events.'
        ),
    },
    {
        'code': 'A10:2025',
        'name': 'Mishandling of Exceptional Conditions',
        'description': (
            'Improper error handling, logical errors, and failing open. '
            'Covers how applications fail to prevent, detect, and respond to '
            'unusual conditions like crashes, data exposure, and state corruption.'
        ),
    },
]

CWE_ENTRIES = [
    {'code': 'CWE-20', 'name': 'Improper Input Validation', 'description': 'The product receives input or data but does not validate or incorrectly validates that the input has the properties required to process the data safely and correctly.'},
    {'code': 'CWE-22', 'name': "Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')", 'description': 'The product uses external input to construct a pathname intended to identify a file or directory below a restricted parent, but does not properly neutralize special elements that can cause the pathname to resolve outside that directory.'},
    {'code': 'CWE-77', 'name': "Improper Neutralization of Special Elements used in a Command ('Command Injection')", 'description': 'The product constructs all or part of a command using externally-influenced input but does not neutralize or incorrectly neutralizes special elements that could modify the intended command.'},
    {'code': 'CWE-78', 'name': "Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')", 'description': 'The product constructs all or part of an OS command using externally-influenced input but does not neutralize or incorrectly neutralizes special elements that could modify the intended OS command.'},
    {'code': 'CWE-79', 'name': "Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')", 'description': 'The product does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page served to other users.'},
    {'code': 'CWE-89', 'name': "Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')", 'description': 'The product constructs all or part of an SQL command using externally-influenced input but does not neutralize or incorrectly neutralizes special elements that could modify the intended SQL command.'},
    {'code': 'CWE-90', 'name': "Improper Neutralization of Special Elements used in an LDAP Query ('LDAP Injection')", 'description': 'The product constructs all or part of an LDAP query using externally-influenced input but does not neutralize or incorrectly neutralizes special elements that could modify the intended LDAP query.'},
    {'code': 'CWE-91', 'name': 'XML Injection (aka Blind XPath Injection)', 'description': 'The product does not properly neutralize special elements that are used in XML, allowing attackers to modify the syntax, content, or commands before they are processed by an end system.'},
    {'code': 'CWE-94', 'name': "Improper Control of Generation of Code ('Code Injection')", 'description': 'The product constructs all or part of a code segment using externally-influenced input but does not neutralize or incorrectly neutralizes special elements that could modify the syntax or behavior of the intended code.'},
    {'code': 'CWE-98', 'name': "Improper Control of Filename for Include/Require Statement in PHP Program ('PHP Remote File Inclusion')", 'description': 'The PHP application receives input that is used to include a file, but does not properly neutralize the input, allowing an attacker to include files from remote or local sources.'},
    {'code': 'CWE-116', 'name': 'Improper Encoding or Escaping of Output', 'description': 'The product prepares a structured message for communication with another component but encoding or escaping of the data is either missing or done incorrectly, resulting in the structure of the message being altered.'},
    {'code': 'CWE-119', 'name': 'Improper Restriction of Operations within the Bounds of a Memory Buffer', 'description': 'The product performs operations on a memory buffer but can read from or write to a memory location outside the intended boundary, leading to potential code execution or data corruption.'},
    {'code': 'CWE-120', 'name': "Buffer Copy without Checking Size of Input ('Classic Buffer Overflow')", 'description': 'The product copies an input buffer to an output buffer without verifying that the size of the input buffer is less than the size of the output buffer, leading to a buffer overflow.'},
    {'code': 'CWE-125', 'name': 'Out-of-bounds Read', 'description': 'The product reads data past the end or before the beginning of the intended buffer, potentially exposing sensitive information or causing a crash.'},
    {'code': 'CWE-129', 'name': 'Improper Validation of Array Index', 'description': 'The product uses untrusted input when calculating or using an array index but does not validate that the index references a valid position within the array.'},
    {'code': 'CWE-134', 'name': 'Use of Externally-Controlled Format String', 'description': 'The product uses a function that accepts a format string as an argument, but the format string originates from an external source, allowing attackers to read or write memory.'},
    {'code': 'CWE-190', 'name': 'Integer Overflow or Wraparound', 'description': 'The product performs a calculation that can produce an integer overflow or wraparound when the logic assumes that the resulting value will always be larger than the original value.'},
    {'code': 'CWE-200', 'name': 'Exposure of Sensitive Information to an Unauthorized Actor', 'description': 'The product exposes sensitive information to an actor that is not explicitly authorized to have access to that information.'},
    {'code': 'CWE-209', 'name': 'Generation of Error Message Containing Sensitive Information', 'description': 'The product generates an error message that includes sensitive information about its environment, users, or associated data, which could help an attacker craft further attacks.'},
    {'code': 'CWE-250', 'name': 'Execution with Unnecessary Privileges', 'description': 'The product performs an operation at a privilege level higher than the minimum required, creating new weaknesses or amplifying the consequences of other weaknesses.'},
    {'code': 'CWE-252', 'name': 'Unchecked Return Value', 'description': 'The product does not check the return value from a method or function, which can prevent it from detecting unexpected states and conditions.'},
    {'code': 'CWE-256', 'name': 'Plaintext Storage of a Password', 'description': 'The product stores a password in plaintext in a file or database, making it readable by anyone with access to that storage.'},
    {'code': 'CWE-259', 'name': 'Use of Hard-coded Password', 'description': 'The product contains a hard-coded password for its own inbound or outbound authentication, creating a significant authentication bypass risk.'},
    {'code': 'CWE-269', 'name': 'Improper Privilege Management', 'description': 'The product does not properly assign, modify, track, or check privileges for an actor, creating an unintended sphere of control.'},
    {'code': 'CWE-276', 'name': 'Incorrect Default Permissions', 'description': 'During installation, the product sets incorrect permissions for an object that exposes it to unintended actors.'},
    {'code': 'CWE-284', 'name': 'Improper Access Control', 'description': 'The product does not restrict or incorrectly restricts access to a resource from an unauthorized actor.'},
    {'code': 'CWE-287', 'name': 'Improper Authentication', 'description': 'The product does not sufficiently verify that a claim of identity is correct, allowing unauthorized access.'},
    {'code': 'CWE-295', 'name': 'Improper Certificate Validation', 'description': 'The product does not validate or incorrectly validates a certificate, enabling man-in-the-middle attacks against TLS/SSL connections.'},
    {'code': 'CWE-306', 'name': 'Missing Authentication for Critical Function', 'description': 'The product does not perform any authentication for functionality that requires a provable user identity or consumes significant resources.'},
    {'code': 'CWE-311', 'name': 'Missing Encryption of Sensitive Data', 'description': 'The product does not encrypt sensitive or critical information before storage or transmission, leaving it exposed to unauthorized access.'},
    {'code': 'CWE-312', 'name': 'Cleartext Storage of Sensitive Information', 'description': 'The product stores sensitive information in cleartext within a resource that might be accessible to another control sphere.'},
    {'code': 'CWE-319', 'name': 'Cleartext Transmission of Sensitive Information', 'description': 'The product transmits sensitive or security-critical data in cleartext in a communication channel that can be sniffed by unauthorized actors.'},
    {'code': 'CWE-326', 'name': 'Inadequate Encryption Strength', 'description': 'The product stores or transmits sensitive data using an encryption scheme that is theoretically sound but is not strong enough for the level of protection required.'},
    {'code': 'CWE-327', 'name': 'Use of a Broken or Risky Cryptographic Algorithm', 'description': 'The product uses a broken or risky cryptographic algorithm or protocol that can be compromised by attackers.'},
    {'code': 'CWE-330', 'name': 'Use of Insufficiently Random Values', 'description': 'The product uses insufficiently random numbers or values in a security context that depends on unpredictable numbers.'},
    {'code': 'CWE-338', 'name': 'Use of Cryptographically Weak Pseudo-Random Number Generator (PRNG)', 'description': 'The product uses a pseudo-random number generator that is not cryptographically strong, making its output predictable.'},
    {'code': 'CWE-345', 'name': 'Insufficient Verification of Data Authenticity', 'description': 'The product does not sufficiently verify the origin or authenticity of data, in a way that causes it to accept invalid data.'},
    {'code': 'CWE-346', 'name': 'Origin Validation Error', 'description': 'The product does not properly verify that the source of data or communication is valid, allowing spoofed requests.'},
    {'code': 'CWE-352', 'name': 'Cross-Site Request Forgery (CSRF)', 'description': 'The web application does not sufficiently verify that a well-formed, valid, consistent request was intentionally provided by the user who submitted the request.'},
    {'code': 'CWE-362', 'name': "Concurrent Execution using Shared Resource with Improper Synchronization ('Race Condition')", 'description': 'The product contains a code sequence that can run concurrently with other code, and the code sequence requires temporary exclusive access to a shared resource but does not properly synchronize access.'},
    {'code': 'CWE-377', 'name': 'Insecure Temporary File', 'description': 'The product creates a temporary file in a directory with insecure permissions or uses an insecure method, allowing attackers to access or modify the file.'},
    {'code': 'CWE-400', 'name': 'Uncontrolled Resource Consumption', 'description': 'The product does not properly control the allocation and maintenance of a limited resource, allowing an actor to influence the amount of resources consumed, leading to denial of service.'},
    {'code': 'CWE-416', 'name': 'Use After Free', 'description': 'The product references memory after it has been freed, which can cause a program to crash, use unexpected values, or execute code.'},
    {'code': 'CWE-434', 'name': 'Unrestricted Upload of File with Dangerous Type', 'description': 'The product allows the upload of files without properly validating the file type, which can lead to remote code execution if the file is processed or served.'},
    {'code': 'CWE-476', 'name': 'NULL Pointer Dereference', 'description': 'The product dereferences a pointer that it expects to be valid but is NULL, typically causing a crash or exit.'},
    {'code': 'CWE-502', 'name': 'Deserialization of Untrusted Data', 'description': 'The product deserializes untrusted data without sufficiently verifying that the resulting data will be valid, enabling object injection or remote code execution.'},
    {'code': 'CWE-522', 'name': 'Insufficiently Protected Credentials', 'description': 'The product transmits or stores authentication credentials, but it uses an insecure method that is susceptible to unauthorized interception or retrieval.'},
    {'code': 'CWE-532', 'name': 'Insertion of Sensitive Information into Log File', 'description': 'The product writes sensitive information to a log file that can be read by an actor who does not have permission to view the sensitive information.'},
    {'code': 'CWE-552', 'name': 'Files or Directories Accessible to External Parties', 'description': 'The product makes files or directories accessible to unauthorized actors, providing sensitive information or allowing code execution.'},
    {'code': 'CWE-601', 'name': "URL Redirection to Untrusted Site ('Open Redirect')", 'description': 'The web application accepts a user-controlled input that specifies a link to an external site and uses that link in a redirect, facilitating phishing attacks.'},
    {'code': 'CWE-611', 'name': 'Improper Restriction of XML External Entity Reference', 'description': 'The product processes an XML document that can contain XML entities with URIs that resolve to documents outside the intended sphere of control, causing XXE attacks.'},
    {'code': 'CWE-613', 'name': 'Insufficient Session Expiration', 'description': 'The product does not sufficiently expire or invalidate session identifiers, allowing attackers to reuse old session credentials.'},
    {'code': 'CWE-614', 'name': "Sensitive Cookie in HTTPS Session Without 'Secure' Attribute", 'description': 'The Secure attribute for a sensitive cookie is not set, which causes the user agent to send the cookie in plaintext over HTTP.'},
    {'code': 'CWE-618', 'name': 'Exposed Unsafe ActiveX Method', 'description': 'An ActiveX control is marked safe for scripting but exposes a dangerous method that can be called by an attacker through a web page.'},
    {'code': 'CWE-639', 'name': 'Authorization Bypass Through User-Controlled Key', 'description': 'The system uses a user-controlled key to determine access authorization, allowing an attacker to modify the key to access other users\' data (IDOR).'},
    {'code': 'CWE-640', 'name': 'Weak Password Recovery Mechanism for Forgotten Password', 'description': 'The product contains a mechanism for users to recover forgotten passwords that is weak, allowing attackers to bypass authentication.'},
    {'code': 'CWE-643', 'name': "Improper Neutralization of Data within XPath Expressions ('XPath Injection')", 'description': 'The product uses external input to dynamically construct an XPath expression without properly neutralizing the input, allowing an attacker to control the query.'},
    {'code': 'CWE-668', 'name': 'Exposure of Resource to Wrong Sphere', 'description': 'The product exposes a resource to the wrong control sphere, providing unintended actors with inappropriate access to the resource.'},
    {'code': 'CWE-676', 'name': 'Use of Potentially Dangerous Function', 'description': 'The product invokes a potentially dangerous function that could introduce a vulnerability if not used correctly.'},
    {'code': 'CWE-693', 'name': 'Protection Mechanism Failure', 'description': 'The product does not use or incorrectly uses a protection mechanism that provides sufficient defense against directed attacks.'},
    {'code': 'CWE-706', 'name': 'Use of Incorrectly-Resolved Name or Reference', 'description': 'The product uses a name or reference to access a resource, but the name or reference resolves to a resource outside the intended control sphere.'},
    {'code': 'CWE-732', 'name': 'Incorrect Permission Assignment for Critical Resource', 'description': 'The product specifies permissions for a security-critical resource in a way that allows that resource to be read or modified by unintended actors.'},
    {'code': 'CWE-749', 'name': 'Exposed Dangerous Method or Function', 'description': 'The product provides an Applications Programming Interface (API) or similar interface that includes a dangerous method or function that is not properly restricted.'},
    {'code': 'CWE-754', 'name': 'Improper Check for Unusual or Exceptional Conditions', 'description': 'The product does not check or incorrectly checks for unusual or exceptional conditions that are not expected to occur frequently during normal operation.'},
    {'code': 'CWE-755', 'name': 'Improper Handling of Exceptional Conditions', 'description': 'The product does not handle or incorrectly handles an exceptional condition, potentially leading to unexpected behavior or security issues.'},
    {'code': 'CWE-770', 'name': 'Allocation of Resources Without Limits or Throttling', 'description': 'The product allocates a reusable resource or group of resources on behalf of an actor without imposing any restrictions on the size or number of resources that can be allocated.'},
    {'code': 'CWE-776', 'name': "Improper Restriction of Recursive Entity References in DTDs ('XML Entity Expansion')", 'description': 'The product uses XML documents and allows their structure to be defined by a DTD, but does not properly control the number of recursive entity references, enabling billion laughs attacks.'},
    {'code': 'CWE-787', 'name': 'Out-of-bounds Write', 'description': 'The product writes data past the end or before the beginning of the intended buffer, which can cause data corruption, a crash, or code execution.'},
    {'code': 'CWE-798', 'name': 'Use of Hard-coded Credentials', 'description': 'The product contains hard-coded credentials such as a password or cryptographic key, which can be extracted by an attacker to bypass authentication.'},
    {'code': 'CWE-829', 'name': 'Inclusion of Functionality from Untrusted Control Sphere', 'description': 'The product imports, requires, or includes executable functionality from a source that is outside the intended control sphere.'},
    {'code': 'CWE-862', 'name': 'Missing Authorization', 'description': 'The product does not perform an authorization check when an actor attempts to access a resource or perform an action.'},
    {'code': 'CWE-863', 'name': 'Incorrect Authorization', 'description': 'The product performs an authorization check when an actor attempts to access a resource or perform an action, but it does not correctly perform the check.'},
    {'code': 'CWE-912', 'name': 'Hidden Functionality', 'description': 'The product contains functionality that is not documented, not part of the specification, and not accessible through normal interfaces, which could be used as a backdoor.'},
    {'code': 'CWE-918', 'name': 'Server-Side Request Forgery (SSRF)', 'description': 'The web server receives a URL or similar request from an upstream component and retrieves the contents of that URL, but does not sufficiently ensure that the request is being sent to the expected destination.'},
    {'code': 'CWE-922', 'name': 'Insecure Storage of Sensitive Information', 'description': 'The product stores sensitive information without properly limiting read or write access by unauthorized actors.'},
    {'code': 'CWE-942', 'name': 'Permissive Cross-domain Policy with Untrusted Domains', 'description': 'The product uses a cross-domain policy file that includes domains that should not be trusted, allowing untrusted origins to access its data.'},
    {'code': 'CWE-1021', 'name': 'Improper Restriction of Rendered UI Layers or Frames', 'description': 'The web application does not restrict or incorrectly restricts frame objects or UI layers that belong to another application or domain, enabling clickjacking attacks.'},
    {'code': 'CWE-1236', 'name': 'Improper Neutralization of Formula Elements in a CSV File', 'description': 'The product saves user-provided information into a CSV file but does not neutralize formula elements, potentially leading to command execution when opened in a spreadsheet application.'},
]


class Command(BaseCommand):
    help = 'Seed ClassificationEntry with assessment areas, OWASP Top 10, and CWE data.'

    def handle(self, *args, **options):
        entries = []
        for item in ASSESSMENT_AREAS:
            entries.append(ClassificationEntry(
                entry_type='assessment_area',
                code=item['code'],
                name=item['name'],
                description=item['description'],
            ))
        for item in OWASP_TOP_10:
            entries.append(ClassificationEntry(
                entry_type='owasp',
                code=item['code'],
                name=item['name'],
                description=item['description'],
            ))
        for item in CWE_ENTRIES:
            entries.append(ClassificationEntry(
                entry_type='cwe',
                code=item['code'],
                name=item['name'],
                description=item['description'],
            ))

        created = ClassificationEntry.objects.bulk_create(entries, ignore_conflicts=True)
        # bulk_create with ignore_conflicts doesn't reliably return created count,
        # so query the total instead.
        total = ClassificationEntry.objects.count()
        self.stdout.write(
            f'  Assessment areas: {len(ASSESSMENT_AREAS)}, '
            f'OWASP Top 10: {len(OWASP_TOP_10)}, '
            f'CWE: {len(CWE_ENTRIES)}'
        )
        self.stdout.write(f'  Total entries in DB: {total}')
        self.stdout.write('Done.')
