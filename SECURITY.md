# Security Policy

Clinical-Contract processes data contracts and may be used around sensitive
healthcare workflows. Security reports are taken seriously, but this project
is not a certified medical device, a regulated data hosting service, or a
replacement for an organization's security controls.

## Supported Versions

Clinical-Contract is currently a pre-1.0 project. Security fixes are provided
for the latest minor release line only.

| Version | Supported |
|---|---|
| `0.3.x` | Yes |
| `< 0.3` | No |

Users should upgrade to the latest release before reporting an issue that may
already have been fixed.

## Reporting a Vulnerability

Do not open a public GitHub issue for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/artheioupfat/clinical-contract/security/advisories/new)
to contact the maintainer. If the private reporting form is unavailable, use
the maintainer's GitHub profile to establish a private communication channel
without publishing technical details.

Include, when possible:

- the affected Clinical-Contract version;
- the affected interface: Python API, CLI, or web editor;
- a clear impact assessment;
- minimal reproduction steps using synthetic data;
- relevant logs with secrets and identifying information removed;
- a suggested remediation, if one is known.

You should receive an acknowledgement within seven days. Status updates and a
coordinated disclosure plan will follow after the report has been assessed.
Please allow time for a fix to be prepared and released before publishing the
details.

## Never Share Real Health Data

Never include real patient data, protected health information, personal data,
production datasets, credentials, tokens, or confidential contracts in an
issue, discussion, pull request, security report, screenshot, or log.

Every reproduction must use synthetic and minimal data. Remove or replace:

- patient and professional identifiers;
- dates, free text, and rare values that could enable re-identification;
- organization names and internal file paths;
- database credentials, URLs, secrets, and access tokens;
- contract metadata that identifies a real study or data exchange.

Maintainers may remove exposed content, but removal from Git history, caches,
notifications, or third-party mirrors cannot be guaranteed.

## SQL Security Scope

Quality rules are treated as untrusted input. Clinical-Contract applies the
following controls before executing a rule with DuckDB:

- exactly one read-only `SELECT` statement is accepted;
- authorized CSV and Parquet sources are materialized into temporary tables;
- external file and network access is disabled before quality rules run;
- extension installation, automatic extension loading, persistent secrets,
  and configuration changes are disabled;
- DuckDB configuration is locked before contract SQL is executed;
- execution is limited to two threads, 2 GB of memory, and 2 GB of temporary
  storage;
- each rule must return one finite numeric value.

Statements such as `COPY`, `ATTACH`, `CREATE`, `DELETE`, `SET`, `PRAGMA`,
`INSTALL`, and `LOAD` are rejected.

These controls reduce the attack surface; they do not turn DuckDB into a
complete security sandbox. A read-only query can still consume significant CPU
time, and malformed data may exercise vulnerabilities in DuckDB or another
dependency. Applications that execute contracts from untrusted organizations
should add process-level timeouts, operating-system isolation, input size
limits, and resource monitoring.

Reports about SQL parser bypasses, unintended file or network access,
configuration bypasses, cross-table authorization issues, or resource-limit
bypasses are in scope.

## Web Application Security Scope

The web editor is a static GitHub Pages application. Clinical-Contract does not
operate an application backend and its code does not intentionally upload
contracts or datasets. Validation and checks run locally in the browser through
PyScript, Pyodide, and DuckDB.

The browser application does retain local state:

- contract drafts are stored in browser storage for up to 24 hours;
- selected data files are stored in IndexedDB for up to 24 hours;
- theme, language, and layout preferences may remain until browser site data is
  cleared.

Users working on shared devices should delete loaded files, reset the contract,
or clear the site's browser data when finished. Real regulated health data
should not be loaded unless browser-side processing has been approved by the
user's organization.

The page downloads pinned runtime dependencies from external CDNs. Network
requests are therefore required to initialize the application, even though the
loaded contract and dataset are processed locally. Browser extensions, a
compromised browser profile, a compromised dependency, or a compromised hosting
origin remain outside the guarantees provided by the application itself.

Reports about cross-site scripting, unintended data transmission, data exposure
between browser sessions, persistence beyond the documented lifetime, unsafe
dependency loading, or bypasses of the local-processing model are in scope.

## Out of Scope

The following are generally out of scope:

- vulnerabilities that affect only unsupported Clinical-Contract versions;
- reports without a reproducible security impact;
- social engineering, phishing, or attacks against project maintainers;
- destructive testing of GitHub, PyPI, CDN providers, or other third-party
  infrastructure;
- public disclosure before the maintainer has had a reasonable opportunity to
  investigate and release a fix.

This policy does not authorize testing against systems or data that you do not
own or have explicit permission to use.
