# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## JScene3D Electron native build safety

- Do not invoke Ninja, autoninja, `e build`, GN generation, or GN cleaning for
  the JScene3D Electron checkout from this repository.
- Do not clean, replace, or invalidate JScene3D Electron native outputs.
- An approved small agent build must use the Electron repository's
  `scripts/jscene3d/build-electron.sh --mode codex` entry point. Its action
  limits are mandatory.
- If that entry point refuses the plan, stop and give the user the corresponding
  `--mode user` command. Do not bypass the refusal through another working
  directory, shell wrapper, or build tool.
