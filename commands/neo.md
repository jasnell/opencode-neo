---
description: "Run a remote command from Neo package registries -- like npx for OpenCode"
neo-version: "0.3.0"
---

The user wants to dynamically run the package command "$1".
Full arguments: $ARGUMENTS

Use the neo_load tool to fetch the command "$1" from configured Neo
registries. The tool will return the command template. Follow those
instructions, substituting any argument placeholders with the
provided arguments.

If the command is not found, use neo_search to suggest alternatives.
If no registries are configured, use neo_registries to help the user
set up their first registry.
