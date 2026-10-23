# Changelog

## 1.0.0

Initial release.

- Reads a folder of Markdown SOP files, recursively, and reads header metadata from YAML style front matter, with a simple header table as a fallback.
- Checks for missing owner, version, review date, and department fields, and flags overdue reviews with the number of days overdue.
- Flags vague terms such as promptly and as needed, with line numbers. The term list is configurable.
- Flags numbered or bulleted steps whose first word is not a verb, using a built in verb list plus an -ing and -s heuristic, applied conservatively.
- Flags internal relative links that point at files which do not exist.
- Writes report.md and findings.csv. Required fields and vague terms can be overridden with a config JSON file.
