# Good First Issues

These are seeded starter issues for new contributors. Each one is self contained and needs no extra services.

## 1. Notion-export folder adapter

A Notion export produces Markdown files with page titles baked into file names, property tables in a different shape, and asset folders beside each page. Add an adapter mode that reads that layout and maps its properties onto the owner, version, review date, and department fields this tool already understands. Ship a small synthetic export fixture and tests, and keep the plain folder mode unchanged.

## 2. Configurable vague-term list per team (extend the v1 config with presets)

Version 1 already lets a config file replace the vague term list, but every team has to write its own list from scratch. Add named presets, for example support, warehouse, and clinical, that a config can select and then extend with its own extra terms. Document how a preset and a local list combine, and cover the combination rules with tests.

## 3. GitHub Action wrapper example

Teams want this lint to run on every pull request that touches their SOP folder. Add an example workflow under a docs or examples folder that installs Node, runs the CLI against a sample folder, and uploads report.md and findings.csv as build artifacts. The example must run with no extra services and should fail the job only when a flag in the workflow is set to do so.
