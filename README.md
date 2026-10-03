# JScene3D Editor

JScene3D Editor is a Code OSS-based authoring environment for JScene3D
projects. It combines a mature desktop workbench with Java-owned project,
validation, and authoring semantics.

```text
Code OSS workbench
        ↓
built-in JScene3D integration
        ↓ authoring protocol
Java authoring service
        ↓
JScene3D project and authoring model
```

Code OSS owns the workbench, editors, views, commands, and user interaction.
Java remains authoritative for interpreting JScene3D projects and applying
authoring operations.

> [!WARNING]
> JScene3D Editor is under active development and has not reached version 1.0.
> Editor behavior, authoring protocols, project integration, and architecture
> may change without backward compatibility. There is no packaged standalone
> release yet.

## What works today

The committed editor baseline includes:

- JScene3D product branding and a focused Code OSS workbench;
- a built-in JScene3D extension and Activity Bar container;
- opening `.j3d` projects and atomically replacing the active project;
- project-aware Code OSS workspace lifecycle handling;
- Project and Hierarchy views;
- a read-only semantic Inspector;
- structured project and definition diagnostics in Problems;
- authored-definition custom editors;
- a macOS native renderer-preview pane backed by the packaged Java renderer;
- a persistent Java authoring-service connection; and
- connection, project, and definition identity checks that reject stale work.

The current working tree is also integrating and manually validating the first
editable Inspector and authored-document lifecycle. That work covers boolean,
integer, numeric, and text edits together with dirty state, undo/redo, save,
revert, backup/restore, and coordinated project close. It is not yet presented
as complete or stable functionality.

Generated definitions are imported or generated content and remain read-only.
See the [current editor architecture](docs/architecture.md) for the precise
boundary between committed behavior, active integration work, and future work.

## Architecture

```text
Code OSS frontend
        ↓ Content-Length framed protocol
Java authoring service
        ↓
editor-authoring and project model
```

The responsibility split is deliberate:

- Code OSS presents Java-owned models through native workbench surfaces.
- Java discovers and validates projects, resolves descriptors and definitions,
  owns semantic identity, and performs authoring and persistence operations.
- TypeScript transports and displays validated data; it does not create a
  competing JScene3D project model.
- Extension descriptors support safe authoring without loading arbitrary game
  runtime implementations into the editor extension host.

The [architecture document](docs/architecture.md) explains project lifecycle,
stale-state protection, Hierarchy and Inspector behavior, diagnostics, and the
in-progress authored-document lifecycle.

## Native viewport status

The editor now includes the first native viewport presentation slice. The
`JScene3D: Open Native Viewport` command opens a renderer preview whose
validation scene is produced by the packaged Java renderer and presented
through the JScene3D Electron downstream:

```text
JScene3D / LWJGL / OpenGL
        ↓
native shared rendering surface
        ↓
Electron / Code OSS presentation
```

This Stage 3 surface validates presentation, resize, visibility, failure, and
renderer-child lifecycle behavior. It does not yet load the active project's
world; real project/world viewport integration is the next architectural step.
The current integration is macOS-specific and does not establish Windows or
Linux native viewport support.

## Relationship to JScene3D

The separate [JScene3D repository](https://github.com/glynch/jscene3d) owns:

- the Java engine and renderer;
- the project and runtime model;
- the Java authoring implementation and service;
- validation, persistence, and recovery semantics; and
- rendering platform support.

This repository owns:

- the Code OSS product fork and JScene3D branding;
- workbench and workspace integration;
- the built-in JScene3D extension;
- editor presentation and document-lifecycle integration; and
- the Code OSS pane and presentation side of native viewport integration.

The authoring protocol and stable semantic identities form the boundary between
the repositories.

## Current limitations

- The native viewport currently renders a deterministic validation scene, not
  an active project world.
- Editable authored-document behavior is being integrated and manually
  validated.
- Project creation is not implemented.
- The source launcher expects the versioned JScene3D authoring runtime to be
  installed in the local Maven repository; it does not build Java artifacts.
- There is no packaged standalone JScene3D Editor release.

## Building and running from source

This repository follows the upstream Code OSS development model. Start with the
[Code OSS build and contribution documentation](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
to prepare the workbench prerequisites on your platform. Then prepare this
checkout with:

```bash
npm install
npm run compile
npm run electron
```

These commands install the Code OSS dependencies, compile the workbench and
built-in JScene3D extension, and download and prepare the source Electron
application under `.build/electron`.

The editor consumes a separately produced JScene3D Java authoring runtime. For
the current `0.1.0-SNAPSHOT` development version, install that runtime from a
checkout of the separate [JScene3D repository](https://github.com/glynch/jscene3d)
with:

```bash
./mvnw install -pl jscene3d-editor-authoring-runtime -am
```

This producer step installs
`jscene3d-editor-authoring-runtime-<version>-runtime.zip` in the local artifact
repository. The editor launcher consumes that installed archive; it does not
invoke Maven. The Java source checkout does not need to be adjacent to this
repository, or remain present after the artifact has been installed.

Once the source application, compiled extension, suitable JDK, and installed
authoring runtime are available, verify the complete launch configuration
without opening the GUI:

```bash
JSCENE3D_ELECTRON_EXECUTABLE=/absolute/path/to/Electron.app/Contents/MacOS/Electron \
  ./scripts/jscene3d/launch-source-editor.sh --check --fresh-profile
```

Then launch the editor with an isolated development profile:

```bash
JSCENE3D_ELECTRON_EXECUTABLE=/absolute/path/to/Electron.app/Contents/MacOS/Electron \
  ./scripts/jscene3d/launch-source-editor.sh --fresh-profile
```

The [source launcher](scripts/jscene3d/launch-source-editor.sh) resolves the
explicit runtime version in `scripts/jscene3d/authoring-runtime.version` from
the following location:

```text
default: $HOME/.m2/repository
override: JSCENE3D_MAVEN_LOCAL_REPOSITORY
```

This is an artifact-storage convention and does not make Maven a launcher
dependency. These environment variables provide advanced overrides:

```text
JSCENE3D_MAVEN_LOCAL_REPOSITORY
JSCENE3D_AUTHORING_SERVICE_MODULE_PATH
JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH
JSCENE3D_JAVA_EXECUTABLE
```

The current snapshot runtime must be installed locally. A future published
runtime artifact can remove the need for developers to build the Java
repository themselves; it is not currently available from Maven Central.

Native viewport development additionally requires the packaged
`jscene3d-editor-renderer-runtime` ZIP and the JScene3D Electron downstream.
The launcher resolves their installed defaults independently, or accepts
`JSCENE3D_RENDERER_RUNTIME_ARCHIVE`, `JSCENE3D_RENDERER_RUNTIME_DIRECTORY`,
and `JSCENE3D_RENDERER_JAVA_EXECUTABLE` overrides. Select the downstream
executable explicitly with `JSCENE3D_ELECTRON_EXECUTABLE`; the standard source
Electron under `.build/electron` does not contain the native renderer API.
Current authoring and native viewport development target macOS; no
shipping-platform support claim is made yet.

## Documentation

- [JScene3D Editor architecture](docs/architecture.md) describes the current
  product boundaries, lifecycle rules, identity model, and integration status.
- [JScene3D engine and project documentation](https://github.com/glynch/jscene3d/tree/main/docs)
  covers the Java engine, project model, runtime, and authoring semantics.

## Code OSS upstream

JScene3D Editor is based on the open-source
[Microsoft Code OSS repository](https://github.com/microsoft/vscode) and retains
its Git ancestry. JScene3D Editor is an independent project: it is not Visual
Studio Code and is not sponsored, supported, or endorsed by Microsoft.

Project-specific contribution and issue-reporting processes are not finalized.
Problems that reproduce in an unmodified Code OSS checkout may belong in the
upstream project's established contribution process; JScene3D-specific support
should not be directed to Microsoft.

## License and attribution

This repository derives from Code OSS and preserves its copyrights, MIT license,
and third-party notices. See [LICENSE.txt](LICENSE.txt) and
[ThirdPartyNotices.txt](ThirdPartyNotices.txt). Those notices do not imply
Microsoft sponsorship or endorsement of JScene3D Editor.
