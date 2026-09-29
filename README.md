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

A native JScene3D viewport is not integrated into this repository. This
checkout contains no JScene3D native-surface transport or native renderer-view
session implementation.

The rendering direction was proven separately in an earlier proof of concept:

```text
JScene3D / LWJGL / OpenGL
        ↓
native shared rendering surface
        ↓
Electron / Code OSS presentation
```

The long-term objective is to present the real Java JScene3D renderer inside
the editor, not to implement a second browser renderer. The earlier proof was
macOS-specific; it does not establish Windows or Linux native viewport support.

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
- the Code OSS side of future native viewport integration.

The authoring protocol and stable semantic identities form the boundary between
the repositories.

## Current limitations

- The native JScene3D viewport is not present in this checkout.
- Editable authored-document behavior is being integrated and manually
  validated.
- Project creation is not implemented.
- The source launcher expects the versioned JScene3D authoring runtime to be
  installed in the local Maven repository; it does not build Java artifacts.
- There is no packaged standalone JScene3D Editor release.

## Building and running from source

This repository follows the upstream Code OSS development model. Start with the
[Code OSS build and contribution documentation](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
to prepare and build the workbench on your platform.

The development launcher requires all of the following to exist already:

- a source-built JScene3D Editor application;
- the compiled built-in JScene3D extension;
- a JDK suitable for the Java authoring service;
- the expected JScene3D authoring runtime installed in the local Maven
  repository.

When the Java artifacts change, install the runtime from the JScene3D Java
repository with:

```bash
./mvnw install -pl jscene3d-editor-authoring-runtime -am
```

The launcher does not compile Code OSS, TypeScript, or Java and does not run
tests. Once the source build, extension output, and installed Java runtime
exist, start an isolated development profile from this repository with:

```bash
./scripts/jscene3d/launch-source-editor.sh --fresh-profile
```

The [source launcher](scripts/jscene3d/launch-source-editor.sh) resolves the
explicit runtime version in `scripts/jscene3d/authoring-runtime.version` from
`$HOME/.m2/repository`. A non-default local repository can be selected with
`JSCENE3D_MAVEN_LOCAL_REPOSITORY`. The launcher does not invoke Maven, and the
Java source checkout does not need to be beside this repository after the
runtime is installed. These environment variables provide advanced overrides:

```text
JSCENE3D_MAVEN_LOCAL_REPOSITORY
JSCENE3D_AUTHORING_SERVICE_MODULE_PATH
JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH
JSCENE3D_JAVA_EXECUTABLE
```

Current authoring development and testing target macOS. The absence of a native
viewport here means this repository does not yet make native viewport support
claims for any shipping platform.

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
