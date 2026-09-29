# JScene3D Editor Architecture

JScene3D Editor is a Code OSS product fork that provides the workbench for
JScene3D project authoring. The editor combines Code OSS presentation and
document lifecycle facilities with Java-owned JScene3D project semantics.

This document describes the architecture present in this repository. It also
identifies the editable-document lifecycle that is currently being integrated
and the native viewport direction that was proven separately but is not part of
this checkout.

## System overview

```text
Code OSS workbench
        |
        v
built-in JScene3D extension
        |
        | Content-Length framed authoring protocol
        v
Java authoring service
        |
        v
JScene3D project and authoring model
```

The boundary is deliberate:

- Code OSS owns workbench presentation, commands, tabs, views, selection,
  native Problems integration, and the custom-document UI lifecycle.
- Java owns project discovery and loading, descriptor interpretation,
  validation, stable project and definition identity, hierarchy and Inspector
  projections, semantic mutations, persistence, and recovery state.
- TypeScript transports and presents Java-owned models. It does not parse
  JScene3D project files into a competing domain model or reproduce project
  validation rules.

## Product and workbench integration

The fork establishes JScene3D as a distinct Code OSS product. Product metadata,
application identifiers, icons, themes, startup splash behavior, and the
JScene3D welcome page are integrated into the product build. Required Java
tooling is treated as protected built-in functionality, while stock surfaces
that are not relevant to the focused editor product are reduced.

The built-in `extensions/jscene3d` extension owns:

- the JScene3D Activity Bar container;
- the Project and Hierarchy views;
- the secondary-sidebar Inspector;
- project, definition, and authoring commands;
- authored-definition custom editors;
- the Java authoring-service process and protocol client;
- project and definition diagnostics;
- editor-side project, definition, selection, and Inspector state.

Workbench contributions provide integration that extension contribution points
cannot express cleanly, including first-level File-menu placement, project
workspace transitions, no-project Explorer presentation, source-control empty
state, startup layout, and the JScene3D welcome experience.

The Project view summarizes Java-owned project identity and asset counts; it is
not a project parser. The Hierarchy is the primary authoring tree, while the
Inspector occupies the secondary sidebar beside the active definition editor.

## Java authoring-service boundary

The built-in extension owns one persistent Java authoring-service process. The
process is started lazily when an operation first requires Java authority and is
kept alive across ordinary project close and reopen operations. Closing a
project invalidates the project session; it does not normally terminate the
service.

On editor shutdown, the extension requests an orderly service shutdown and
waits for process exit. Time-bounded termination and kill fallbacks prevent an
owned child process from being left behind. Unexpected process exit, transport
failure, or protocol failure marks the service unavailable and invalidates the
editor-side assumption that Java state remains authoritative.

### Protocol framing and negotiation

Messages use JSON carried over the Java process standard streams with
`Content-Length` framing. Standard output is reserved for protocol traffic.
Java standard error is bounded, line-buffered, and forwarded to the JScene3D
Output channel as operational information.

Initialization negotiates:

- a major and minor protocol version;
- the Java service and engine versions;
- the service process kind;
- the set of supported protocol capabilities;
- a service connection generation.

The client rejects an incompatible major version, a service minor version below
its requirement, or missing required capabilities. Wire values are validated
before becoming editor state. The current working tree expands the protocol for
definition mutation, history, persistence, and recovery; that integration is
still under active development.

Requests and responses use explicit data-transfer objects. They carry values
needed for presentation and authoring decisions without exposing Java object
graphs or moving domain behavior into TypeScript.

### Safe authoring metadata

The source launch boundary supplies installed extension metadata separately
from the service module path. Descriptor-derived projections let the editor
inspect projects, definitions, hierarchy, and Inspector metadata without
loading executable game components into the Code OSS extension host. Detailed
discovery rules remain the responsibility of the Java repository.

## Identity and stale-state protection

Editor state can outlive a project or Java connection, so identity contains
more than a filename.

### Service connection generation

The Java service issues a connection generation during initialization. Each
subsequent authoring response is checked against the generation accepted by the
client. A response from a different service lifetime is rejected even if its
other fields look valid.

### Project generation

Java assigns a project generation to each accepted active project session.
Project replacement creates a new generation. Definition open, Inspector read,
mutation, history, persistence, and recovery requests carry the expected
generation.

The editor clears generation-scoped definition and selection state when the
active project generation changes. Project close confirms the exact generation
that Java invalidated.

### Definition identity

`AssetId` is the semantic identity used to request a definition. An authored
definition also has a source URI. A generated definition receives a JScene3D
virtual resource URI because it has no editable source file.

The custom-editor resource URI includes:

- the service connection generation;
- the project generation;
- the definition `AssetId`;
- the authored source URI or generated virtual URI.

That composite resource prevents a restored or stale tab from silently binding
to a similarly named definition in a different Java connection or project
session.

### Hierarchy and Inspector identity

A `HierarchyOccurrenceDto` identifies one occurrence by its containing
definition `AssetId` and entity path. A `HierarchySemanticTargetDto` adds the
semantic target kind, source, stable identity, and optional occurrence.

Editable Inspector values expose an `InspectorMutationTargetDto`. The target
identifies either an entity-enabled value or a component property and includes
the occurrence and the relevant entity, component, and property identifiers.

Inspector reads are accepted only when their project generation, definition
revision, and semantic target still match the active selection. Late responses
for an earlier selection are ignored or rejected. Mutation requests likewise
carry the expected definition revision.

These checks prevent stale tabs, selections, reads, and edits from being
reinterpreted against a coincidentally similar project after replacement or
service restart.

## Project and workspace lifecycle

The editor permits one active JScene3D project session. A project is selected by
its local `.j3d` descriptor, while Java resolves and validates the actual project
root and project model.

### Opening a project

Code OSS obtains a local descriptor URI and sends its path to Java. Java returns
either an accepted project generation and summary or a rejected result with
diagnostics. Only an accepted result can initiate a transition to a
single-folder workspace rooted at the Java-resolved project root. A versioned
reopen intent carries the accepted project across the resulting extension-host
restart.

The intended descriptor and Java-resolved project root must agree with the
activated workspace before the persisted reopen request is honored.

### Atomic replacement

Selecting another project while one is open uses the Java project-replacement
operation rather than independently closing and opening from TypeScript. The
request includes the expected current project generation.

Java can accept the replacement, reject the candidate while retaining the
current project, or report a generation conflict. The editor changes workspaces
only after Java accepts the candidate. In the current editable-document work,
open authored documents are coordinated with the native dirty-document
lifecycle before replacement proceeds.

### Closing a project

Project close coordinates document closure before invalidating Java state. When
the document lifecycle allows closure, Java closes the exact active generation,
the persisted reopen intent is removed, and Code OSS returns to an empty
workspace.

If the user cancels a native dirty-document prompt, project close or replacement
is cancelled and the active Java project remains valid.

An external workspace change that no longer matches the project root clears the
reopen intent and closes the retained Java project session. Extension disposal
also stops project callbacks before shutting down the service process.

The editor keeps a small presentation cache that updates context keys, views,
definition mappings, and diagnostics. It is not an independent source of
project truth. Authority failures move the project state to an unavailable
state instead of guessing how to recover.

## Hierarchy and Inspector

Opening a definition asks Java to retain it and return an authoritative snapshot
containing its context, revision, and hierarchy roots. The snapshot distinguishes
authored and generated origins and declares whether each projected value is
editable.

### Hierarchy

The Hierarchy is a native Code OSS Tree View backed directly by the current Java
snapshot. Nodes represent local entities, placements, and generated entities.
They carry stable occurrence and semantic target data rather than relying on
labels or tree positions as identity.

Selecting a node establishes the semantic authoring context used by the
Inspector. The selection remains editor-side interaction state, while the
meaning and projected data for that target remain Java-owned.

### Inspector

The Inspector is a webview view driven by a validated Java snapshot. It presents
entity, component, and placement groups together with property provenance,
constraints, validation state, descriptions, and appropriate semantic display
models.

The committed implementation provides read-only semantic presentation. The
current working tree adds the first writable slice for:

- boolean values;
- integer values;
- general numeric values;
- text values.

An editor control is enabled only when Java marks the property editable and
provides a mutation target. Numeric text is screened for complete or
intermediate syntax in the webview, but Java remains responsible for
authoritative validation and acceptance.

Compound values such as vectors, Euler rotations, quaternions, and linear
colors, along with references, targets, collections, and object summaries,
remain presentation-only in this slice. Unsupported, projected, or generated
values remain read-only.

Webview messages are treated as untrusted input. The extension checks the
message shape, resolves the property against the current Inspector snapshot,
verifies that the candidate matches the registered scalar editor, and sends a
stable Java-issued mutation target rather than a UI-derived path.

## Authored-definition document lifecycle

The editable-document lifecycle currently present in the working tree is an
in-progress integration. Its architecture is established, but this document
does not imply that every manual UI path is complete or defect-free.

```text
Code OSS custom document and Inspector
        ^                         |
        | refreshed snapshot      | semantic operation
        |                         v
Java source-preserving working copy
```

Java owns the source-preserving authored document, its revision, dirty state,
history, validation, persistence, and backup representation. Code OSS owns the
tab, custom-document events, dirty indicator, native save/revert entry points,
undo/redo integration, backup destination, and user-facing close prompts.

The custom editor does not reconstruct the source file from the reduced
Hierarchy or Inspector projection. A supported edit is sent as a semantic
mutation against a Java-issued target and expected revision. Java can accept the
operation, report a no-op, reject it with diagnostics, or reject a stale
revision. The extension refreshes the authoritative definition snapshot after
state-changing operations.

### Dirty state and history

After Java accepts a mutation, the custom-editor provider emits a native
document edit. This makes Code OSS own the visible dirty state and associates
the edit with Java-backed undo and redo callbacks.

Undo and redo send the current expected revision to Java and refresh the
definition snapshot after acceptance. Operations are serialized so overlapping
UI actions cannot reorder revision-sensitive requests.

### Save and revert

Native save delegates to Java's definition-save operation. Native revert
delegates to Java's definition-revert operation. Both operations use the active
definition identity and revision and then refresh the authoritative snapshot.

`Save As` is intentionally unsupported for JScene3D authored definitions in the
current implementation.

### Backup and restore

Code OSS requests an opaque backup from Java and writes those bytes to the
backup destination supplied by the custom-document API. Recovery reads that
backup and explicitly restores it into a newly opened definition for the active
project generation.

Backup data is not treated as a TypeScript-owned serialization format. Generated
definitions do not support editable recovery backups.

### Project-close coordination

Before project close or replacement, the Inspector is allowed to finish or
reject pending local input and the custom editor waits for pending mutations.
The provider then asks Code OSS to close the relevant tabs. Native dirty-document
prompts therefore run before Java invalidates the project generation.

If document closure is refused or cancelled, project invalidation does not
continue. This ordering prevents a dirty tab from losing the Java working copy
that gives its content meaning.

## Problems, diagnostics, and logging

Java-produced structured diagnostics are projected into native Code OSS
diagnostic collections and therefore appear in Problems. Diagnostics retain
their severity, stable code, source resource, message, and JSON location.

Separate collections hold active-project diagnostics, rejected open or
replacement diagnostics, and definition open or edit diagnostics.

Replacing a collection removes obsolete entries instead of accumulating stale
problems from an earlier operation or project generation.

Operational information is separate from domain diagnostics. Process startup,
protocol negotiation, project transitions, failures, and Java standard error
are written to the JScene3D Output channel. Output text is not used as a
substitute for structured Problems entries.

## Native viewport status

This checkout does not contain or mount the earlier JScene3D native viewport.
It has no JScene3D IOSurface transport, Electron SharedTexture integration,
`VideoFrame` bridge, WebGPU presentation surface, or native renderer-session
orchestration.

The native rendering direction was proven in a separate earlier Code OSS proof
of concept:

```text
JScene3D / LWJGL / OpenGL
        |
        v
native shared rendering surface
        |
        v
Electron / Code OSS presentation
```

That proof established the intended principle: the editor should present the
real JScene3D renderer rather than implement a second browser scene renderer.
This repository currently focuses on the authoring and workbench integration,
and the proven viewport path has not yet been integrated into this branch.

Detailed native transport mechanisms are intentionally not documented here
because their implementation is absent from this checkout.

## Relationship to the JScene3D repository

The separate [JScene3D repository](https://github.com/glynch/jscene3d) owns:

- the Java engine and rendering APIs;
- the project and runtime model;
- Java authoring implementation and service;
- validation, persistence, and recovery semantics;
- rendering platform support.

This repository owns:

- the Code OSS product fork and branding;
- workbench and workspace integration;
- the built-in JScene3D extension;
- editor presentation and document lifecycle integration;
- the Code OSS side of future native viewport integration.

The protocol and stable identities form the repository boundary. Java details
belong in the JScene3D repository rather than being duplicated here.

## Current development dependencies

The current source launcher is a development convenience, not the standalone
distribution contract. It resolves an explicit version of the installed
`jscene3d-editor-authoring-runtime` artifact from `$HOME/.m2/repository`, or
from the repository selected by `JSCENE3D_MAVEN_LOCAL_REPOSITORY`.

The installed runtime archive provides:

- the Maven-resolved authoring-service JPMS runtime closure;
- the WAD import descriptor JAR; and
- the Doom descriptor JAR.

The runtime is installed from the Java repository with its Maven Wrapper, then
consumed without consulting that source checkout. The launcher does not invoke
Maven. The editor repository records its expected Java version in one
launcher-specific version file.

Environment overrides can replace the local Maven repository, service module
path, extension metadata path, and Java executable. The launcher does not build
Java, the extension, or Code OSS; it launches existing output with an isolated
profile. A final packaged editor may bundle the Java runtime differently.

## Current limitations

- The native JScene3D viewport is not integrated into this checkout.
- The editable-document lifecycle remains under active development and manual
  UI verification.
- The source launcher requires the versioned authoring runtime to have been
  installed in the local Maven repository.
- Project creation is not implemented; the command currently reports that it is
  deferred.
- A packaged standalone JScene3D Editor distribution has not been established.

## Architectural invariants

The current implementation depends on the following rules:

- Java remains authoritative for JScene3D project and authoring semantics.
- TypeScript presents validated DTOs and does not create a parallel project
  model.
- Project state is scoped by the Java project generation.
- Definition editor identity is scoped by service connection generation,
  project generation, and `AssetId`.
- Hierarchy and Inspector operations use Java-issued semantic identities rather
  than labels or visible tree positions.
- Revision-sensitive operations carry the expected definition revision.
- Generated definitions remain read-only.
- Native document closure completes before Java invalidates a dirty working
  copy.
- Structured authoring diagnostics use Problems; operational process information
  uses Output.
- The eventual viewport reuses the native JScene3D renderer rather than creating
  a browser renderer with separate scene semantics.
