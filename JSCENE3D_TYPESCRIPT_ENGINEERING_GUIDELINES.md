# JScene3D TypeScript Coding Standards

## 1. Purpose and Scope

These standards define the TypeScript engineering practices for JScene3D functionality implemented within the Code OSS codebase.

They apply to permanent JScene3D TypeScript code, including:

- the built-in JScene3D extension;
- authoring-service integration;
- protocol clients and wire DTOs;
- project and authoring state;
- commands and context keys;
- Project, Hierarchy, Inspector, and future JScene3D views;
- diagnostics and Output integration;
- process supervision;
- tests and test-support code.

The goal is to keep the TypeScript implementation:

- strongly typed;
- maintainable;
- testable;
- explicit about ownership and lifecycle;
- consistent with Code OSS conventions;
- independent of legacy JScene3D JavaFX editor abstractions;
- correctly separated from Java-authoritative domain behavior.

These standards supplement, rather than replace, the conventions and quality rules of the Code OSS repository.

Where Code OSS already provides an established API, lifecycle mechanism, UI abstraction, or engineering convention, JScene3D code should use it rather than introducing a parallel framework.

Cross-process and cross-repository architectural rules remain governed by `JSCENE3D_EDITOR_INTEGRATION_DEVELOPMENT_STANDARDS.md`.

These standards do not define Java coding practices, Java domain architecture, Electron/native implementation, or runtime/rendering architecture.

## 2. Relationship to Code OSS Standards

JScene3D TypeScript is part of the Code OSS codebase and must follow the repository's established TypeScript conventions, compiler configuration, ESLint rules, formatting, and extension-development patterns.

These standards add JScene3D-specific requirements where the host repository's general conventions do not define the architectural decision.

When rules overlap, use the following precedence:

1. Code OSS build, compiler, lint, and repository requirements must be satisfied.
2. JScene3D architectural boundaries defined by the integration standards must be preserved.
3. These TypeScript standards govern JScene3D-specific implementation choices.
4. Existing nearby Code OSS code should be used as a style and API-usage reference where it is consistent with the rules above.

Do not copy an existing Code OSS pattern solely because it exists. Code OSS contains code from different periods and subsystems, and not every historical pattern is appropriate for new JScene3D code.

Likewise, do not introduce a preferred generic TypeScript pattern when Code OSS already provides an established mechanism for the same responsibility.

In particular, prefer native Code OSS or VS Code mechanisms for:

- commands;
- context keys;
- views and tree providers;
- diagnostics;
- Output channels;
- notifications;
- configuration;
- workspace lifecycle;
- cancellation;
- disposables;
- extension activation and deactivation.

JScene3D should own game-engine and authoring-specific behavior. It should not create a parallel editor framework inside Code OSS.

When an existing Code OSS convention conflicts with a documented JScene3D architectural requirement, do not silently work around the conflict. Treat it as an architectural issue requiring review.

## 3. Core Engineering Principles

### 3.1 Prefer Simple, Explicit Code

Choose the simplest implementation that clearly satisfies the current requirement.

Do not introduce abstractions, factories, registries, generic frameworks, or extension points for hypothetical future needs.

Create an abstraction when it provides a concrete benefit such as:

- separating an architectural boundary;
- making ownership or lifecycle explicit;
- enabling meaningful testing;
- isolating an external dependency;
- supporting more than one real implementation.

### 3.2 Preserve Architectural Boundaries

TypeScript must not reproduce Java-authoritative JScene3D domain behavior.

Java owns concepts such as:

- project loading and validation;
- schemas and descriptor semantics;
- authored hierarchy projection;
- Inspector domain projection;
- authoritative mutations;
- revisions;
- dirty state;
- save, revert, undo, and redo.

TypeScript owns Code OSS integration and presentation.

When information is missing from the Java contract, do not reconstruct it independently in TypeScript merely because doing so is convenient.

### 3.3 Use Native VS Code APIs

Prefer the host editor's existing capabilities over JScene3D-specific infrastructure.

For example:

- Problems for diagnostics;
- Output channels for operational logging;
- commands for user actions;
- context keys for enablement;
- workspace APIs for workspace state;
- tree APIs for hierarchical views;
- native notifications for important user-facing failures;
- disposables for lifecycle management.

Do not create parallel frameworks for capabilities already provided by VS Code.

### 3.4 Keep State Ownership Clear

Every piece of mutable state must have one clear owner.

Views should consume state rather than becoming authoritative stores.

Protocol clients should transport information rather than own project state.

Process supervisors should own process lifecycle rather than project presentation.

Avoid multiple caches of the same authoritative information unless there is a demonstrated need and an explicit synchronization strategy.

### 3.5 Separate Domain Data from Presentation

Models received from or derived from Java must not be shaped around a particular VS Code control.

For example, hierarchy data should describe hierarchy nodes and relationships, not `TreeItem` objects.

Inspector data should describe typed properties, constraints, values, and mutation capabilities, not controls or rendered strings.

Presentation adapters convert authoring data into VS Code-specific representations.

### 3.6 Make Lifecycle Explicit

Long-lived resources must have explicit creation, ownership, state transitions, and disposal.

This includes:

- Java processes;
- protocol transports;
- pending requests;
- subscriptions;
- Output channels;
- diagnostic collections;
- project state;
- views and providers.

Do not rely on garbage collection or process termination as the normal cleanup mechanism.

### 3.7 Treat Asynchrony as State

Any operation that crosses a process boundary or waits on external state can complete after the state that initiated it has changed.

Code must account explicitly for:

- project close during project open;
- service termination during a request;
- stale responses;
- extension disposal;
- repeated commands;
- concurrent operations.

Do not assume operations complete in the order they were started.

### 3.8 Fail Explicitly

Unexpected states and invalid external data must produce explicit failures.

Do not silently:

- ignore malformed protocol messages;
- substitute invented defaults;
- swallow rejected promises;
- continue after incompatible protocol initialization;
- accept stale authoritative state.

Expected user/domain failures should be represented through the appropriate structured error or diagnostic path.

### 3.9 Keep Permanent Code Separate from POC Configuration

Temporary development requirements such as locating an unbundled Java authoring service must be isolated behind narrow boundaries.

Do not allow development-specific paths, environment assumptions, fixture locations, or launch mechanics to spread through permanent application code.

### 3.10 Optimize for Maintainability

Code should make its responsibility and dependencies apparent to another developer without requiring knowledge of its implementation history.

Prefer:

- small cohesive files;
- explicit dependencies;
- narrow public surfaces;
- descriptive types;
- predictable control flow;
- focused tests.

Avoid cleverness that saves a small amount of code while making ownership, typing, lifecycle, or failure behavior harder to understand.

## 4. TypeScript Language Standards

### 4.1 Use Strict TypeScript

All new JScene3D TypeScript must compile under the strictness settings established by the Code OSS repository and the JScene3D extension configuration.

Do not weaken compiler options to accommodate new code.

Treat compiler errors as design or implementation problems rather than obstacles to work around.

### 4.2 Do Not Use `any`

Do not introduce explicit `any` in permanent JScene3D code.

Use:

- a concrete type when the structure is known;
- `unknown` for untrusted or not-yet-validated data;
- generics where the relationship between types is genuinely reusable;
- discriminated unions for known variants.

Do not use type assertions merely to convert `unknown` into the desired type without validation.

If an external Code OSS API exposes `any`, contain it at the integration boundary and convert it immediately to a safer type.

### 4.3 Prefer `unknown` at Trust Boundaries

Data entering from an external or dynamically typed boundary starts as `unknown`.

This includes:

- parsed JSON;
- protocol messages;
- configuration values not already strongly typed by the API;
- test fixtures representing external data.

Validate the value before treating it as a protocol DTO or application model.

Do not type `JSON.parse(...)` directly as the expected DTO.

### 4.4 Avoid Unsafe Type Assertions

Type assertions such as:

```typescript
value as ProjectSummaryDto

## 5. Types and Type Safety

### 5.1 Types Should Express the Model

Types should describe meaningful application, protocol, and presentation concepts rather than merely satisfy the compiler.

Prefer types that make invalid states difficult to represent and make ownership or intent clear at the call site.

Avoid large general-purpose objects containing unrelated optional properties.

### 5.2 Separate Wire Types from Application Types

Protocol DTOs represent the Java wire contract.

Application models represent TypeScript-side state and behavior.

Do not assume they must always be the same type.

Use the wire DTO directly when it already represents exactly what the TypeScript consumer needs. Introduce an application model only when there is a concrete reason to transform, combine, index, or enrich the wire data.

Do not create duplicate model layers mechanically.

### 5.3 Separate Authoring Data from VS Code Presentation Types

Authoring models must not depend on VS Code presentation types.

For example, do not model hierarchy data as:

```typescript
interface HierarchyNode {
 readonly item: vscode.TreeItem;
 readonly children: readonly HierarchyNode[];
}
```

Instead keep the authoring information independent:

```typescript
interface HierarchyNode {
 readonly id: string;
 readonly label: string;
 readonly kind: HierarchyNodeKind;
 readonly children: readonly HierarchyNode[];
}
```

The view layer maps that information to `TreeItem` instances.

The same rule applies to Inspector models, diagnostics, assets, project state, and runtime inspection data.

### 5.4 Do Not Duplicate Java Domain Models

TypeScript should not recreate Java classes such as complete project, world, entity, component, descriptor, or working-copy models.

Represent only the information required by the TypeScript client.

The Java authoring service remains authoritative for JScene3D domain behavior.

A TypeScript type with a similar name to a Java domain type must exist because it serves a TypeScript or wire-contract purpose, not because mirroring Java feels convenient.

### 5.5 Prefer Narrow Types

Functions and classes should depend on the smallest useful contract.

If a view requires only project summary state, do not give it the complete authoring-service client.

If a protocol operation requires only a descriptor path, do not pass an entire project-state object.

Narrow dependencies make ownership clearer and tests simpler.

### 5.6 Avoid Boolean Parameters When Meaning Is Unclear

Avoid APIs such as:

```typescript
openProject(path, true, false);
```

Use an options object or distinct operation when the meaning is not immediately obvious:

```typescript
openProject(path, {
 preserveDiagnostics: true,
 revealView: false
});
```

Do not introduce an options object for a single obvious boolean merely as ceremony.

### 5.7 Model Identity Explicitly

Different identities must not be treated as interchangeable simply because they share the same primitive representation.

Examples include:

- project ID;
- project-session generation;
- authoring revision;
- asset identity;
- hierarchy occurrence identity;
- Inspector target identity;
- protocol request ID.

Use descriptive types and property names.

Introduce branded or opaque TypeScript identity types when doing so prevents realistic accidental interchange.

Do not invent TypeScript identity semantics that differ from Java authority.

### 5.8 Preserve Generation and Revision Distinctions

A project-session generation and an authoring revision represent different concepts.

Do not use one as a substitute for the other.

Conceptually:

```text
generation
    identifies a particular project/session lifetime

revision
    identifies authoritative authoring state within that lifetime
```

Types and method signatures should make this distinction apparent.

### 5.9 Use Structured Results for Meaningful Outcomes

When an operation has multiple legitimate outcomes, represent them explicitly rather than using sentinel values.

Prefer:

```typescript
type OpenProjectResult =
 | { readonly kind: 'opened'; readonly project: ProjectSummary }
 | { readonly kind: 'rejected'; readonly diagnostics: readonly ProjectDiagnostic[] };
```

over conventions such as:

```typescript
ProjectSummary | undefined
```

when `undefined` cannot explain why the operation did not produce a project.

Do not wrap every function in a custom result type when exceptions or ordinary absence already express the semantics correctly.

### 5.10 Distinguish Domain Failure from Technical Failure

Types should preserve the difference between expected JScene3D/domain outcomes and infrastructure failures.

For example:

```text
invalid project
    → structured project diagnostics

incompatible protocol
    → protocol compatibility failure

Java process exits
    → service/process failure
```

Do not collapse these into one generic error object merely because the UI may eventually display all three.

### 5.11 Keep Error Types Structured

Where callers need to distinguish failure categories, use structured error types or classes with stable machine-readable information.

Do not require callers to parse human-readable error messages.

Messages are for people.

Codes, variants, and structured fields are for program behavior.

### 5.12 Prefer Interfaces for Object Contracts

Prefer `interface` for ordinary named object-shaped contracts that may be implemented or consumed structurally.

Prefer `type` for:

- unions;
- intersections;
- aliases;
- mapped forms;
- tuple types;
- primitive combinations.

Follow established nearby Code OSS convention where it differs and there is no architectural consequence.

Do not convert between `interface` and `type` merely for stylistic consistency.

### 5.13 Avoid Broad Index Signatures

Avoid types such as:

```typescript
interface Data {
 [key: string]: unknown;
}
```

when the supported fields are known.

Broad index signatures weaken compiler assistance and make accidental contract drift easier.

Use them only for genuinely open-ended data, such as explicitly defined metadata/detail maps.

### 5.14 Validate Before Narrowing External Data

Runtime validation functions should establish the type of external data.

Prefer:

```typescript
function isProjectSummaryDto(value: unknown): value is ProjectSummaryDto {
 // validate required wire fields
}
```

or an equivalent validation approach consistent with the protocol implementation.

After validation, downstream code should operate on strongly typed values rather than repeatedly checking the same structure.

### 5.15 Keep Validation and Business Logic Separate

Runtime DTO validation establishes whether external data has the expected wire shape.

It should not perform JScene3D domain validation that belongs to Java.

For example, TypeScript may validate that:

```text
projectId is a string
diagnostics is an array
generation is an integer
```

It should not decide whether:

```text
the project ID is semantically valid
the startup world exists
an asset reference is legal
```

Those are Java-authoritative concerns.

### 5.16 Avoid Parallel Representations Without a Reason

Do not maintain multiple representations of the same state such as:

```text
raw DTO
normalized DTO
project model
view model
tree model
```

unless each transformation solves a demonstrated problem.

Every additional representation creates synchronization and maintenance cost.

Use the fewest model boundaries that preserve architecture and testability.

### 5.17 Public Types Form Contracts

Types exported from a JScene3D TypeScript module should be treated as supported contracts within the extension.

Do not export implementation types by default.

Keep types local or internal when they are used only by one implementation.

A type should be exported because another module genuinely needs the contract, not merely because exporting it is convenient.

## 6. Naming Conventions

### 6.1 Follow Code OSS Naming Conventions

Use the naming conventions established by nearby modern Code OSS TypeScript unless a JScene3D-specific rule below requires greater precision.

Names should communicate responsibility without requiring knowledge of implementation history.

### 6.2 Use `camelCase` for Values and Functions

Use `camelCase` for:

- variables;
- parameters;
- properties;
- functions;
- methods.

```typescript
const projectSummary = await authoringService.openProject(descriptorPath);

function publishDiagnostics(diagnostics: readonly ProjectDiagnostic[]): void {
 // ...
}
```

### 6.3 Use `PascalCase` for Types and Classes

Use `PascalCase` for:

- classes;
- interfaces;
- type aliases;
- discriminated-union types.

```typescript
interface ProjectSummary {
 // ...
}

type AuthoringServiceState =
 | 'stopped'
 | 'starting'
 | 'ready'
 | 'stopping'
 | 'failed';
```

### 6.4 Name by Responsibility

Prefer names describing what a type owns or does.

Good examples include:

```text
AuthoringService
ProjectState
ProjectDiagnostics
ProjectView
MessageTransport
JsonRpcClient
ContentLengthFraming
```

Avoid vague names such as:

```text
Manager
Helper
Utils
Handler
Processor
Common
Misc
```

unless the more specific context makes the responsibility genuinely clear.

A class named `ProjectManager` is usually less informative than one named for the actual responsibility it owns.

### 6.5 Do Not Encode Implementation History in Permanent Names

Names should describe the current architecture rather than how the code evolved.

Avoid names such as:

```text
NewProjectService
LegacyReplacement
Stage1Client
PocProtocol
TemporaryProjectState
```

when the implementation is intended to become permanent.

Milestone and POC terminology belongs in reports, tests, or development configuration rather than permanent production APIs.

### 6.6 Use JScene3D Terminology Consistently

Use the same terminology as the authoritative Java domain and protocol where the concepts are the same.

For example, do not arbitrarily rename:

```text
project
descriptor
asset
world
entity
component
generation
revision
diagnostic
hierarchy
Inspector
```

to different TypeScript terminology merely because another term is familiar from VS Code.

Different names are appropriate when the TypeScript concept is genuinely different.

### 6.7 Distinguish Similar Architectural Concepts in Names

Names should preserve important distinctions such as:

```text
ProjectSessionGeneration
AuthoringRevision
ProtocolRequestId
HierarchyOccurrenceId
InspectorTarget
```

Do not use a generic name such as `id`, `version`, or `state` where the surrounding context does not make the meaning unambiguous.

Local variables may use shorter names when their meaning is obvious from a small scope.

### 6.8 Name DTOs Explicitly

Types representing the wire protocol should use a consistent DTO naming convention.

For example:

```typescript
interface ProjectSummaryDto {
 // ...
}

interface ProjectDiagnosticDto {
 // ...
}
```

Do not use `Dto` for ordinary TypeScript application or presentation models.

The suffix indicates that the type represents a cross-process wire contract.

### 6.9 Do Not Add `I` Prefixes to Interfaces

Do not use Hungarian-style interface names such as:

```text
IProjectState
IAuthoringService
IProjectView
```

Use:

```text
ProjectState
AuthoringService
ProjectView
```

If both an interface and implementation need distinct names, name them according to their actual roles rather than mechanically prefixing one.

### 6.10 Avoid Redundant Type Suffixes

Do not add suffixes such as:

```text
Object
Data
Info
Model
Manager
Impl
```

unless they communicate a meaningful distinction.

For example, `ProjectSummary` is preferable to `ProjectSummaryData`.

`ProjectViewModel` is appropriate only when the type genuinely represents a presentation-specific view model distinct from project state.

### 6.11 Name Services for the Capability They Own

A service name should identify a coherent responsibility.

Prefer:

```text
AuthoringService
ProjectDiagnostics
ProjectState
```

over:

```text
JScene3DService
EditorService
ApplicationService
```

when the broader name hides multiple unrelated responsibilities.

Do not create a single catch-all `JScene3DService`.

### 6.12 Name Events and Changes by What Happened

Change and notification names should describe the semantic event rather than the implementation mechanism.

Prefer concepts such as:

```text
projectChanged
diagnosticsChanged
hierarchyChanged
serviceStateChanged
```

over:

```text
dataUpdated
refreshEvent
notifyListeners
```

The event API may follow established VS Code naming conventions where appropriate.

### 6.13 Name Commands Consistently

JScene3D command identifiers should use the existing extension namespace:

```text
jscene3d.*
```

Use stable semantic command names such as:

```text
jscene3d.openProject
jscene3d.closeProject
```

Do not include UI placement in the command identity.

For example, prefer:

```text
jscene3d.openProject
```

over:

```text
jscene3d.projectViewOpenButton
```

A command describes an action, not where the action is presented.

### 6.14 Name Context Keys by State

Context keys should describe the state being queried.

For example:

```text
jscene3d.projectOpen
jscene3d.projectBusy
```

Avoid context keys tied unnecessarily to one specific UI control.

Keep the number of context keys small and introduce them only when Code OSS contribution enablement or visibility genuinely requires them.

### 6.15 File Names Should Reflect Their Primary Responsibility

Use file names that correspond clearly to the main exported responsibility.

Examples:

```text
authoringService.ts
projectState.ts
projectDiagnostics.ts
projectView.ts
jsonRpcClient.ts
messageTransport.ts
contentLengthFraming.ts
```

Do not create generic files such as:

```text
utils.ts
helpers.ts
common.ts
types.ts
misc.ts
```

as dumping grounds for unrelated code.

A focused `types.ts` may be acceptable when a small cohesive subsystem genuinely consists primarily of related type declarations, but prefer names that identify the subsystem or contract.

### 6.16 Test Names Should Describe Behavior

Test names should state the observable behavior or contract being verified.

Prefer:

```text
rejects a truncated framed message
clears project diagnostics when the project closes
ignores a stale project-open result
```

over:

```text
test framing
project test
works correctly
```

Tests should make the intended contract understandable without reading their implementation.

### 6.17 Avoid Unnecessary Abbreviations

Prefer complete terms unless the abbreviation is established and unambiguous in the project or ecosystem.

Established terms such as these are acceptable:

```text
DTO
JSON
RPC
URI
URL
ID
API
UTF-8
```

Do not invent abbreviations merely to shorten identifiers.

### 6.18 Rename When Responsibility Changes

When a type or module evolves so that its existing name becomes misleading, rename it as part of the architectural change.

Do not preserve misleading names solely to minimize the diff when there is no external compatibility requirement.

Conversely, do not rename stable concepts merely for stylistic preference.

## 7. Files, Modules and Package Organization

### 7.1 Organize by Responsibility

Organize JScene3D TypeScript around coherent responsibilities rather than technical categories alone.

For example:

```text
authoring/
protocol/
project/
hierarchy/
inspector/
runtime/
```

is preferable to a structure dominated by generic folders such as:

```text
services/
models/
utils/
helpers/
```

when those folders mix unrelated features.

### 7.2 Keep Architectural Layers Visible

The source layout should make important boundaries apparent.

For example:

```text
protocol/
    framing
    transport
    JSON-RPC
    wire contracts

authoring/
    service process
    authoring client

project/
    project state
    diagnostics
    presentation

hierarchy/
    hierarchy state/projection
    VS Code tree presentation

inspector/
    Inspector state
    VS Code presentation
```

The exact structure may evolve, but protocol, state ownership, and presentation should not become indistinguishable.

### 7.3 Keep Files Cohesive

A file should normally contain one primary responsibility and closely related supporting declarations.

Do not place process supervision, protocol parsing, project state, commands, and view presentation into one large file merely because they belong to the same extension.

Split a file when doing so creates a meaningful responsibility boundary.

Do not split small cohesive code merely to reduce line count.

### 7.4 Keep `extension.ts` Thin

The extension entry point should primarily perform composition and lifecycle wiring.

Typical responsibilities include:

- creating long-lived services;
- invoking feature registrations;
- registering top-level services and feature disposables;
- connecting high-level state changes;
- disposing resources on extension shutdown.

It should not contain substantial implementations of:

- JSON-RPC;
- framing;
- process supervision;
- project loading logic;
- diagnostic conversion;
- hierarchy projection;
- Inspector logic.

Activation should make the component relationships visible rather than hiding the implementation inside callbacks.

When adding or materially extending Project, Definitions, Hierarchy, Inspector,
Scene View, or Game View, keep that feature's adapters, diagnostics, listeners,
commands, and disposal in its feature or registration modules. `extension.ts`
should invoke those registrations and coordinate only genuinely shared or
cross-feature lifecycle boundaries.

Future work must extend the relevant feature registration rather than wiring
new feature behavior directly into `extension.ts`.

### 7.5 Keep Protocol Code Independent of VS Code Presentation

Low-level protocol code must not depend on:

- tree views;
- notifications;
- commands;
- Output channels;
- diagnostic collections;
- workspace presentation state.

Framing and JSON-RPC should be testable without launching VS Code.

Higher layers decide how protocol outcomes are presented to the user.

### 7.6 Keep Authoring-Service Integration Separate from Project State

The authoring-service client owns communication with Java.

Project state owns the TypeScript representation of the currently active project lifecycle.

Do not make the protocol client itself the application's project-state store.

Conceptually:

```text
Java process
    ↓
protocol client
    ↓
authoring service
    ↓
project state
    ↓
views / diagnostics / commands
```

Each layer should have a clear reason to exist.

### 7.7 Views Must Not Own Domain or Protocol State

A Project, Hierarchy, or Inspector view should consume state provided by an appropriate owner.

Do not make a `TreeDataProvider` responsible for:

- launching Java;
- sending protocol requests unrelated to presentation;
- parsing `.j3d`;
- owning the current project session;
- validating domain data.

Views may initiate user actions through commands or narrow services, but they must not become the authoritative backend.

### 7.8 Avoid Circular Dependencies

Feature and infrastructure modules must have a clear dependency direction.

Do not resolve circular imports through dynamic imports, shared mutable singletons, or moving unrelated declarations into a generic `common.ts`.

A circular dependency usually indicates unclear ownership and should be corrected at the design level.

### 7.9 Avoid Barrel Files by Default

Do not create broad `index.ts` files that re-export entire directories merely to shorten imports.

Barrel files can hide dependency direction, increase accidental coupling, and make it unclear which declarations form the supported surface.

Use a focused barrel only when the directory intentionally defines a small public facade and the benefit is clear.

### 7.10 Keep Internal Types Internal

Do not export classes, interfaces, functions, or constants merely because another file might need them someday.

Start with the narrowest visibility practical.

Export a declaration when a real consumer exists.

This makes subsystem boundaries easier to understand and refactor.

### 7.11 Do Not Create Generic Utility Dumping Grounds

Avoid files or modules such as:

```text
utils.ts
helpers.ts
common.ts
shared.ts
```

containing unrelated functions.

Place a helper beside the responsibility that owns it.

If the same functionality later has multiple genuine consumers, extract it into a clearly named shared responsibility.

### 7.12 Keep VS Code Adapters Near Presentation

Conversions such as:

```text
ProjectDiagnostic → vscode.Diagnostic
HierarchyNode → vscode.TreeItem
ProjectSummary → Project view item
```

belong near the VS Code presentation/integration code that needs them.

Do not place VS Code-specific adapters in protocol or authoring-domain modules.

### 7.13 Keep Wire DTOs Together with the Protocol Contract

Wire DTO declarations and their runtime validation should live in the protocol layer.

Do not scatter protocol DTO definitions across views or feature implementations.

Feature code may import validated DTO contracts where necessary, but it should not redefine them.

### 7.14 Keep Tests Near the Responsibility They Verify

Follow Code OSS repository conventions for test placement.

Within those conventions, keep test organization aligned with production responsibilities.

Protocol framing tests should be clearly associated with framing.

Project-state tests should be clearly associated with project state.

Avoid a single large JScene3D test file covering unrelated subsystems.

### 7.15 Separate Production and Test Support

Test doubles, fixtures, fake transports, and process harnesses should not leak into production APIs.

Reusable test support should live in test-owned locations unless it represents a genuine production abstraction.

Do not add production hooks solely to make tests easier when the same behavior can be tested through an appropriate boundary.

### 7.16 Keep Development Configuration Isolated

Development-only concerns such as locating an unbundled Java service must remain isolated from feature logic.

For example:

```text
development Java location
    ↓
process launcher configuration
```

should not propagate into:

```text
project state
Project view
Hierarchy
Inspector
protocol DTOs
```

Production packaging should later be able to replace the development launcher configuration without restructuring the extension.

### 7.17 Do Not Mirror the Java Package Structure

TypeScript source organization should reflect TypeScript responsibilities.

Do not reproduce the Java package tree simply because the TypeScript code communicates with Java.

For example, Java may organize domain concepts around project packages while TypeScript organizes presentation around Project, Hierarchy, and Inspector features.

Shared terminology should remain consistent, but source-tree structure does not need to match.

### 7.18 Avoid Premature Package Proliferation

Do not create a new directory or subsystem for every new class or protocol operation.

A new package/directory should represent a meaningful responsibility or architectural boundary.

Prefer adding a cohesive file to an existing responsibility over creating another layer whose only purpose is organizational symmetry.

### 7.19 Refactor Structure When Ownership Becomes Clearer

Early milestones may reveal that code belongs under a different responsibility.

Move it when the architectural ownership becomes clear.

Do not preserve a poor source location merely because it was introduced in an earlier POC milestone.

Likewise, do not reorganize stable code solely to make the directory tree aesthetically uniform.

## 8. Imports, Exports and Dependency Direction

### 8.1 Dependencies Must Follow Architectural Ownership

Imports should follow the intended dependency direction.

For the authoring extension, the general direction is:

```text
VS Code presentation
        ↓
feature state / application coordination
        ↓
authoring service client
        ↓
protocol
        ↓
transport
```

Lower layers must not import higher presentation layers.

For example, protocol code must not import the Project view simply because a protocol failure eventually needs to refresh it.

### 8.2 Depend on the Narrowest Appropriate Layer

Import from the layer that actually owns the required contract.

Do not reach through one subsystem to obtain something owned by another.

For example:

```text
Project view
    → ProjectState
```

is preferable to:

```text
Project view
    → AuthoringService
        → protocol
```

when the view only needs current project state.

### 8.3 Do Not Bypass State Owners

If a subsystem owns mutable state, consumers must use its supported API rather than reaching into lower-level components to reconstruct or mutate that state independently.

For example, if `ProjectState` owns the current opened-project state, a view must not independently query the protocol client and maintain a second copy.

### 8.4 Keep Protocol Dependencies Pointing Inward

The protocol layer may define and validate wire contracts.

It must not depend on:

- project views;
- hierarchy views;
- Inspector views;
- notifications;
- diagnostics presentation;
- workspace UI;
- command enablement.

Feature layers depend on protocol capabilities, not the reverse.

### 8.5 Keep VS Code Dependencies at Integration Boundaries

Where practical, pure state, protocol, framing, and transport code should not import `vscode`.

Use VS Code APIs in the layers that genuinely integrate with the editor.

This improves:

- testability;
- architectural clarity;
- reuse;
- separation between authoring data and presentation.

Do not introduce artificial wrapper layers around every VS Code API solely to eliminate imports.

### 8.6 Avoid Importing Implementation Details

Import from a subsystem's supported surface rather than reaching into internal implementation files.

If another subsystem repeatedly needs an internal type, reconsider whether that type should form part of a deliberate public contract.

Do not make implementation files public merely to avoid designing the correct boundary.

### 8.7 Export Deliberately

Every exported declaration increases the supported surface of a subsystem.

Export only what another production module genuinely consumes.

Prefer keeping:

- helper functions;
- validators used by one file;
- implementation classes;
- internal state representations;
- parsing details;

unexported where possible.

### 8.8 Avoid Re-Export Chains

Do not create long chains such as:

```text
feature/index.ts
    → model/index.ts
        → types/index.ts
            → actual declaration
```

Importing code should make ownership reasonably apparent.

Re-exporting is appropriate when a module intentionally presents a small stable facade.

### 8.9 Avoid Circular Imports

Circular imports are not an acceptable mechanism for sharing state or resolving ownership.

If two modules require each other's implementation details, identify the underlying responsibility and place the shared contract with the appropriate owner.

Do not solve cycles with:

- dynamic `import()` solely to defer resolution;
- global mutable state;
- service locators;
- generic `common` modules containing unrelated declarations.

### 8.10 Do Not Introduce Dependency Inversion Mechanically

Interfaces and injected dependencies are useful when they establish a real boundary or enable meaningful testing.

Do not create an interface for every class merely so that all dependencies point to abstractions.

For example, a protocol client may warrant a narrow interface when project-state tests need a controlled fake.

A small immutable value object generally does not need an interface and implementation pair.

### 8.11 Avoid Global Service Access

Do not expose application services through mutable global variables or singleton lookup functions.

Long-lived services should normally be created during extension activation and passed explicitly to the components that need them.

This keeps:

- ownership visible;
- disposal deterministic;
- tests isolated;
- dependencies discoverable.

### 8.12 Keep Extension Activation as the Composition Root

The extension activation layer is the natural place to construct and connect major long-lived components.

Conceptually:

```text
activate
    ↓
Output
Diagnostics
Process Launcher
Protocol Client
Authoring Service
Project State
Project View
Commands
```

The exact graph may evolve, but creation should remain explicit.

Do not let lower-level classes instantiate unrelated application services themselves.

### 8.13 Avoid Hidden Construction of Expensive Resources

Classes should not unexpectedly create:

- Java processes;
- sockets;
- file watchers;
- Output channels;
- diagnostic collections;
- long-lived timers;

inside unrelated operations.

Resource creation should occur at a boundary where ownership and disposal are clear.

### 8.14 Keep Test Dependencies Out of Production

Production modules must not import test fixtures, fake transports, test process launchers, or test-only utilities.

Tests may depend on production contracts.

Production must not depend on tests.

### 8.15 Use Type-Only Imports Where Appropriate

Use TypeScript type-only imports where required or encouraged by Code OSS conventions and compiler settings.

For example:

```typescript
import type { ProjectSummaryDto } from '../protocol/authoringProtocol.js';
```

when the import is used only as a type and the repository's module conventions support that form.

Do not apply type-only imports mechanically if nearby Code OSS conventions or compiler behavior make another form appropriate.

### 8.16 Avoid Deep Cross-Feature Imports

A feature should not reach deeply into another feature's directory structure to obtain internal implementation details.

For example, avoid dependencies conceptually like:

```text
hierarchy/
    → project/internal/projectStateImplementation
```

Prefer a narrow supported project-state contract.

Repeated deep imports are evidence that a subsystem boundary needs review.

### 8.17 Dependency Direction Matters More Than Convenience

Do not introduce an architectural dependency solely because it saves a small amount of mapping or duplicate presentation code.

A small adapter at the correct boundary is preferable to coupling protocol, state, and presentation layers together.

Conversely, do not duplicate genuine domain logic merely to avoid a dependency. Domain authority remains Java-side.

### 8.18 Review Dependency Changes Deliberately

When adding an import that crosses a major subsystem boundary, consider whether the dependency direction is correct.

Particular care is required for dependencies between:

```text
protocol
authoring service
project state
hierarchy
Inspector
runtime/Play
VS Code presentation
```

If a new feature requires reversing an established dependency direction, treat that as an architectural decision rather than an ordinary import.

## 9. Immutability and State Management

### 9.1 Prefer Immutable Data

Treat DTOs, snapshots, diagnostics, summaries, hierarchy projections, and Inspector projections as immutable values.

Prefer replacing a snapshot over allowing unrelated consumers to mutate it in place.

Use `readonly` types where mutation is not part of the contract.

### 9.2 Mutable State Must Have One Owner

Every mutable piece of application state must have one clearly identifiable owner.

For example:

```text
AuthoringService
    owns Java process/service lifecycle

ProjectState
    owns current TypeScript project lifecycle state

ProjectDiagnostics
    owns published VS Code project diagnostics

ProjectView
    consumes ProjectState
```

Do not allow multiple components to independently maintain authoritative copies of the same state.

### 9.3 Distinguish Authoritative State from Cached State

Java is authoritative for JScene3D authoring state.

TypeScript may cache Java-derived information required for presentation and interaction, but that cache does not become domain authority.

Examples include:

- project summary;
- project-session generation;
- authoring revision;
- hierarchy snapshot;
- Inspector projection;
- diagnostics.

Do not mutate cached Java-derived state locally and assume Java now has the same state.

### 9.4 Views Are Not State Stores

Views and providers should render state owned elsewhere.

A `TreeDataProvider`, Inspector provider, or other presentation component must not become the canonical owner of:

- the active project;
- project generation;
- hierarchy state;
- Inspector target;
- diagnostics;
- authoring revision.

View-specific state such as expansion or reveal behavior may remain presentation-owned where appropriate.

### 9.5 Model Lifecycle States Explicitly

Do not represent lifecycle using loosely related booleans when a state machine is clearer.

Prefer a closed state model such as:

```typescript
type ProjectState =
 | { readonly kind: 'closed' }
 | { readonly kind: 'opening' }
 | { readonly kind: 'open'; readonly project: OpenProject }
 | { readonly kind: 'closing'; readonly project: OpenProject }
 | { readonly kind: 'failed'; readonly diagnostics: readonly ProjectDiagnostic[] };
```

The exact states should reflect actual behavior.

Do not add states merely for theoretical completeness.

### 9.6 Avoid Impossible State Combinations

Do not design state objects that permit combinations such as:

```text
projectOpen = false
projectSummary = present
projectGeneration = present
projectClosing = true
```

when those combinations have no legitimate meaning.

Use types and transitions that make invalid combinations difficult to construct.

### 9.7 State Transitions Should Be Centralized

Changes to important lifecycle state should occur through the state owner.

Do not scatter assignments to project state across:

- commands;
- views;
- protocol callbacks;
- diagnostics;
- process-exit handlers.

Those components should request or report transitions through the appropriate owner.

### 9.8 Make State Transitions Observable

Consumers should be able to respond when relevant state changes without polling.

Use established VS Code event patterns or a small focused event mechanism appropriate to the owning component.

Do not expose mutable state and require consumers to periodically inspect it for changes.

### 9.9 Publish Consistent Snapshots

Notify consumers after the owning component has transitioned to a coherent new state.

Do not emit an event halfway through a transition where consumers can observe internally inconsistent data.

For example, a successful project-open transition should establish the returned summary, generation, and diagnostics before notifying consumers that the project is open.

### 9.10 Preserve Java Generations and Revisions

Store Java-provided generations and revisions exactly as authoritative state.

Do not generate replacement values in TypeScript.

Use them to reject or ignore stale asynchronous results where appropriate.

Generation and revision checks must occur before stale data is applied to visible state.

### 9.11 Guard Against Stale Asynchronous Results

An asynchronous operation may finish after the state that initiated it no longer exists.

For example:

```text
open A starts
    ↓
local state changes or closes
    ↓
open A response arrives
```

The stale response must not blindly repopulate current state.

Use operation identity, session generation, revision, or another explicit mechanism appropriate to the operation.

Do not rely only on promise completion order.

### 9.12 Do Not Mutate State from Presentation Callbacks Indirectly

A view callback should not reach into state internals and mutate fields.

User actions should invoke an explicit operation such as:

```text
openProject
closeProject
selectInspectorTarget
mutateProperty
save
undo
redo
```

The owning service/state component performs the transition and then publishes the resulting state.

### 9.13 Keep Derived State Derived

Do not store a second mutable value when it can be reliably derived from authoritative state.

For example, if command enablement can be determined from:

```text
project state = open
```

do not maintain an unrelated `canCloseProject` boolean unless it represents additional independent state.

Avoid synchronization problems between stored and derived values.

### 9.14 Context Keys Are Presentation State, Not Domain State

VS Code context keys exist to control editor contributions such as command enablement and visibility.

They are not authoritative JScene3D state.

Update them from the relevant application state owner.

Do not read context keys back as the source of truth for whether a project is actually open.

### 9.15 Diagnostics Are Published State

The diagnostic collection represents information published to VS Code Problems.

It should be derived from authoritative Java diagnostics retained by the appropriate project/application state.

Do not edit diagnostics locally to change the meaning of a Java validation result.

Presentation mapping such as severity conversion or fallback source ranges is acceptable when it preserves the underlying diagnostic.

### 9.16 Avoid Shared Mutable Collections

Do not expose mutable arrays, maps, or sets that callers can modify behind the owner's back.

Prefer:

- readonly snapshots;
- query methods;
- explicit mutation operations.

Internally mutable collections are acceptable when they have one clear owner.

### 9.17 Avoid Module-Level Mutable State

Do not use module-level variables as hidden application state.

Long-lived mutable state should normally belong to an explicitly created object whose lifecycle is controlled by extension activation and disposal.

Module-level immutable constants are appropriate.

### 9.18 Do Not Use VS Code Workspace State as a General State Store

Use extension/workspace persistence APIs only for information that genuinely needs persistence across editor sessions.

Do not persist transient state such as:

- current protocol request IDs;
- Java process state;
- pending requests;
- current hierarchy snapshots;
- temporary Inspector state.

Persisted state requires an explicit lifecycle and compatibility reason.

### 9.19 Reset Project-Scoped State Together

When a project closes or the Java service fails irrecoverably, all state scoped to that project must be invalidated coherently.

This may include:

```text
project summary
generation
revision
diagnostics
hierarchy
Inspector target/projection
dirty state
pending project-specific operations
```

Do not leave stale project-derived information visible after its owning project session is gone.

### 9.20 Keep Process State Separate from Project State

A Java authoring process can exist without an open project.

Model that distinction explicitly.

For example:

```text
service ready + project closed
```

is a valid state.

Closing a project must not implicitly mean the service has stopped.

Likewise, unexpected service termination must invalidate any project state that depended on that process.

### 9.21 Prefer State Replacement Over Incremental Mutation for Snapshots

For server-derived snapshots such as hierarchy or Inspector data, prefer replacing the previous validated snapshot with the new authoritative result.

Do not incrementally patch local copies unless the protocol deliberately defines incremental updates and the complexity is justified.

### 9.22 Keep State Models Focused

Do not create one global `JScene3DState` containing every piece of extension state.

Separate state according to ownership and lifecycle.

For example:

```text
service lifecycle
project lifecycle
hierarchy snapshot
Inspector state
runtime/Play state
```

may have related but distinct owners.

Combine them only where one component genuinely owns their coordinated lifecycle.

## 10. Functions, Classes and Interfaces

### 10.1 Prefer the Simplest Appropriate Construct

Use the simplest construct that clearly represents the responsibility.

Prefer:

- functions for stateless operations;
- immutable objects for data;
- classes when identity, mutable state, lifecycle, or resource ownership is meaningful;
- interfaces when a real contract between components is required.

Do not create a class merely to group related functions.

Do not convert stateful lifecycle components into collections of loosely related functions merely to avoid classes.

### 10.2 Keep Functions Focused

A function should perform one coherent operation at one level of abstraction.

Avoid functions that simultaneously:

- perform protocol communication;
- mutate application state;
- update VS Code UI;
- log output;
- display notifications.

Coordinate those responsibilities at an appropriate higher layer.

### 10.3 Prefer Small Public APIs

Classes and modules should expose the smallest API required by their consumers.

Keep implementation methods private when callers do not need them.

Do not expose internal state merely to simplify testing or avoid writing an appropriate operation.

### 10.4 Constructors Establish Valid Objects

After construction, an object should normally be in a valid usable state.

Do not require callers to remember an undocumented sequence such as:

```typescript
const service = new AuthoringService();
service.setLauncher(launcher);
service.setOutput(output);
service.initializeInternalState();
```

Prefer constructor dependencies or an explicit lifecycle operation where asynchronous startup is genuinely required.

### 10.5 Do Not Perform Asynchronous Work in Constructors

Constructors must not start asynchronous operations.

Use explicit methods such as:

```typescript
await service.start();
```

when initialization requires asynchronous work.

This makes failure, ownership, and lifecycle visible to callers.

### 10.6 Inject Significant Dependencies

Pass significant collaborators explicitly rather than constructing them deep inside implementation code.

Typical injected dependencies may include:

- process launchers;
- transports;
- protocol clients;
- state owners;
- Output abstractions where useful for testing;
- clocks or filesystem boundaries only when genuinely required.

Do not inject ordinary value objects or standard language utilities merely for consistency.

### 10.7 Do Not Create Interfaces for Every Class

An interface is justified when:

- multiple real implementations exist;
- a meaningful architectural boundary exists;
- tests require a controlled substitute at that boundary;
- callers should depend on a narrower contract than the implementation exposes.

Do not create pairs such as:

```text
ProjectState
ProjectStateImpl
```

without a concrete reason.

### 10.8 Prefer Composition Over Inheritance

Use composition to combine behavior.

Avoid implementation inheritance between JScene3D services or feature components unless there is a genuine substitutable relationship.

Do not create base classes merely to share a few helper methods.

Extract a focused collaborator or function instead.

### 10.9 Avoid Deep Class Hierarchies

Permanent JScene3D TypeScript should not depend on complex inheritance trees.

Deep hierarchies obscure:

- lifecycle;
- ownership;
- dependencies;
- state transitions;
- testing behavior.

Follow required VS Code inheritance patterns where an API specifically requires them, but do not extend that pattern into JScene3D architecture unnecessarily.

### 10.10 Prefer Explicit Parameters

Functions should receive the information they require explicitly.

Avoid hidden dependencies on:

- global state;
- module-level mutable variables;
- current workspace state fetched deep inside domain-independent code;
- implicit singleton services.

A function that depends on current project state should make that dependency apparent through its owner or parameters.

### 10.11 Avoid Excessive Parameter Lists

If a function requires many related parameters, consider whether they form a meaningful cohesive input object.

Prefer:

```typescript
interface OpenProjectRequest {
 readonly descriptorPath: string;
 readonly operationId: number;
}
```

when those values genuinely describe one operation.

Do not create parameter objects merely to hide poor responsibility boundaries.

### 10.12 Keep Side Effects Visible

Functions that perform significant side effects should have names and ownership that make those effects apparent.

For example:

```text
publishDiagnostics
startAuthoringService
closeProject
updateWorkspace
```

are clearer than generic names such as:

```text
process
handle
apply
update
```

when the operation has important external effects.

### 10.13 Separate Calculation from Side Effects Where Useful

When logic can be expressed as a pure transformation, keep it separate from the side effect that consumes the result.

For example:

```text
Java diagnostic DTO
    ↓
mapDiagnostic(...)
    ↓
vscode.Diagnostic
    ↓
DiagnosticCollection.set(...)
```

This makes mapping logic independently testable.

Do not force every trivial transformation into a separate function.

### 10.14 Return Values Should Have Clear Semantics

Do not use ambiguous return conventions such as:

```typescript
boolean
```

when callers need to know more than success or failure.

Use a meaningful result, structured outcome, or exception according to the operation's semantics.

A boolean is appropriate when the question genuinely has only two meanings.

### 10.15 Do Not Return Internal Mutable State

Do not return mutable internal arrays, maps, sets, or state objects directly when callers could modify them.

Return readonly snapshots or provide narrow query operations.

### 10.16 Methods Should Respect Ownership

A method should operate primarily on state owned by its class.

If a class contains many methods whose main purpose is manipulating another component's state, responsibility is probably misplaced.

### 10.17 Keep Classes Cohesive

A class should have one primary reason to change.

For example, `AuthoringService` may change because Java process/protocol lifecycle changes.

It should not also change because Project view rendering changes.

If a class accumulates unrelated responsibilities, split by ownership rather than arbitrary size.

### 10.18 Avoid Catch-All Services

Do not create classes such as:

```text
JScene3DManager
JScene3DService
EditorController
ApplicationManager
```

that gradually accumulate unrelated functionality.

Prefer focused components whose responsibilities can be described in one sentence.

### 10.19 Keep Callbacks Narrow

When a callback is required, define the smallest useful signature.

Avoid callbacks receiving broad context objects containing unrelated services and state.

For long-lived change observation, prefer the established event/subscription mechanism over ad hoc callback arrays.

### 10.20 Avoid Callback-Based Domain Operations

Do not represent authoring capabilities as executable callbacks embedded inside data models.

For example, an Inspector property must not contain:

```typescript
edit: (value: string) => void;
```

The model should expose stable mutation information, and the caller should invoke an explicit authoring operation.

This preserves the process boundary and keeps data serializable.

### 10.21 Keep Protocol Operations Explicit

Protocol-facing methods should correspond to clear service capabilities.

Prefer:

```typescript
initialize(...)
openProject(...)
closeProject(...)
```

over a generic method such as:

```typescript
execute(method: string, payload: unknown)
```

outside the low-level JSON-RPC layer.

Generic dispatch belongs inside protocol infrastructure, not feature code.

### 10.22 Keep VS Code Types at the Appropriate Boundary

Functions in presentation layers may accept and return VS Code types where that is their responsibility.

Functions in protocol, transport, or authoring-state layers should not accept VS Code types merely for caller convenience.

For example, convert a `vscode.Uri` to the required wire representation at the integration boundary rather than making the protocol depend on `vscode.Uri`.

### 10.23 Dispose Stateful Classes Explicitly

A class that owns disposable resources should implement the disposal convention used by Code OSS or VS Code.

Disposal should be:

- deterministic;
- safe to call according to the host convention;
- responsible for resources actually owned by the class.

Do not dispose dependencies that were injected but are owned elsewhere.

### 10.24 Do Not Hide Lifecycle in Static Methods

Avoid static service methods that conceal long-lived state or resources.

Static functions are appropriate for stateless transformations and utilities.

Process supervision, project state, subscriptions, and diagnostics publication should have explicit instances and ownership.

### 10.25 Keep Interfaces Narrow and Consumer-Oriented

When an interface is warranted, define the operations the consumer actually needs.

Do not expose an implementation's entire public surface through an interface automatically.

A narrow contract improves dependency clarity and makes tests more meaningful.

### 10.26 Refactor When Signatures Reveal Wrong Ownership

Repeatedly passing the same unrelated services through several layers, large parameter lists, or methods requiring broad application context are signals that responsibility may be misplaced.

Do not solve these symptoms by introducing a larger context object.

Review the ownership boundary instead.

## 11. Asynchronous Code and Concurrency

### 11.1 Treat Every Asynchronous Boundary as a State Boundary

Any operation involving:

- the Java authoring service;
- process lifecycle;
- filesystem access;
- VS Code workspace operations;
- user interaction;
- protocol requests;

may complete after the state that initiated it has changed.

Do not assume that an operation is still relevant merely because its promise resolved successfully.

### 11.2 Always Handle Promises

Do not create unobserved promises.

Every promise must be:

- awaited;
- returned to a caller that owns it; or
- deliberately detached with explicit error handling.

Do not use:

```typescript
someAsyncOperation();
```

when rejection could become unhandled.

### 11.3 Avoid `void` as an Error-Suppression Mechanism

Do not use:

```typescript
void someAsyncOperation();
```

merely to silence promise handling requirements.

Detached asynchronous work is acceptable only when the operation genuinely outlives the caller and has its own complete failure handling.

Make that intent clear.

### 11.4 Prefer `async`/`await`

Use `async`/`await` for ordinary asynchronous control flow.

Prefer:

```typescript
const result = await client.openProject(path);
applyResult(result);
```

over long promise chains when sequential control flow is clearer.

Promise composition such as `Promise.all` is appropriate when operations are genuinely independent.

### 11.5 Do Not Serialize Independent Work Accidentally

Do not await independent operations sequentially merely because it is simpler to write.

For example, if several independent presentation updates can safely occur together, concurrent execution may be appropriate.

However, correctness and lifecycle clarity take precedence over minor performance gains.

### 11.6 Do Not Parallelize Stateful Operations Without a Defined Policy

Operations affecting the same authoritative state require explicit concurrency semantics.

Examples include:

```text
open project
close project
save
undo
redo
mutation
service startup
service shutdown
```

Do not allow these operations to race merely because JavaScript permits multiple promises to run concurrently.

Define whether operations are:

- serialized;
- rejected while another operation is active;
- superseded by a newer operation;
- safe to execute concurrently.

### 11.7 Prevent Duplicate Initialization

Long-lived resources such as the Java authoring service must protect against concurrent startup.

If multiple callers request startup while startup is already in progress, they should normally share the same initialization operation rather than launching multiple processes.

The same principle applies to other singleton-per-extension resources.

### 11.8 Use Explicit Operation Identity for Superseding Work

When a newer operation makes an older asynchronous result irrelevant, use an explicit mechanism to recognize the stale result.

For example:

```text
open project A starts
open/close state changes
project A response arrives
```

The old result must not overwrite current state.

Use:

- operation tokens;
- session generations;
- revisions;
- cancellation;

according to the semantics of the operation.

Do not use timing assumptions.

### 11.9 Respect Java Session Generations

Project-session generations returned by Java identify Java-authoritative session lifetimes.

Store and compare them where required.

Do not create a TypeScript replacement generation and treat it as equivalent.

A local operation token may additionally protect TypeScript UI state, but it serves a different purpose.

### 11.10 Respect Authoring Revisions

Mutation requests must use the authoritative revision semantics defined by the Java authoring service.

Do not optimistically advance Java-authoritative revisions in TypeScript.

When Java rejects a stale mutation, treat that as an authoritative concurrency outcome rather than silently retrying with a newer revision.

### 11.11 Do Not Silently Retry Mutations

Automatic retries are inappropriate for operations whose meaning depends on a particular authoring revision.

A retry against newer state may represent a different operation from the one the user initiated.

Surface or reconcile the conflict according to the feature's defined behavior.

### 11.12 Use Cancellation Where It Has Real Semantics

Use VS Code cancellation tokens or another established mechanism when an operation can meaningfully and safely be cancelled.

Do not add cancellation parameters to every asynchronous method pre-emptively.

Cancellation must define what happens to:

- the local operation;
- the protocol request;
- the Java operation;
- any eventual response.

If Java cannot cancel the underlying operation, TypeScript may still stop applying or presenting the result, but that distinction must be explicit.

### 11.13 Cancellation Does Not Mean Rollback

Cancelling local interest in an asynchronous operation does not imply that Java or the filesystem rolled back the operation.

Do not present cancellation as transactional rollback unless the underlying operation actually guarantees it.

### 11.14 Handle Process Termination During Requests

If the Java process or protocol transport terminates:

- reject all pending requests;
- prevent new requests from using the dead connection;
- transition service state explicitly;
- invalidate project state dependent on that process;
- clean up owned resources.

Do not leave promises unresolved.

### 11.15 Handle Extension Disposal During Asynchronous Work

Extension shutdown may occur while operations are in progress.

Disposal must prevent late asynchronous results from:

- updating disposed views;
- publishing diagnostics after disposal;
- changing context keys;
- spawning replacement processes;
- recreating disposed state.

Shutdown behavior must be deterministic.

### 11.16 Avoid Async Event Handlers with Unobserved Failures

When a VS Code event or command callback invokes asynchronous work, ensure the returned promise is observed by the host API where supported or explicitly handled.

Do not allow exceptions from asynchronous callbacks to disappear into event infrastructure.

### 11.17 Keep Pending Request Ownership in the Protocol Client

JSON-RPC request correlation belongs to the protocol client.

Feature code should not maintain its own maps of protocol request IDs and promises.

The protocol client is responsible for:

- assigning IDs;
- tracking pending requests;
- resolving responses;
- rejecting protocol errors;
- rejecting requests on connection failure.

### 11.18 Serialize Transport Writes

Protocol writes must not interleave bytes from multiple messages.

The transport owns write serialization.

Feature code should be able to issue concurrent requests without knowing how framed writes are serialized.

### 11.19 Do Not Assume Stream Chunk Boundaries

A process `stdout` data event is not a protocol message boundary.

Framing code must support:

- partial headers;
- partial payloads;
- multiple messages in one chunk.

Higher layers must receive complete decoded messages only.

### 11.20 Avoid Arbitrary Delays for Coordination

Do not use:

```typescript
setTimeout(...)
```

or sleeps to wait for:

- service readiness;
- project opening;
- view initialization;
- process termination;
- state propagation.

Wait for an explicit event, promise, state transition, or process signal.

Timers are appropriate only when time itself is part of the requirement.

### 11.21 Timeouts Must Represent a Real Policy

Do not add arbitrary timeouts merely to prevent tests or operations from waiting indefinitely.

When a timeout is required, document what it means operationally and what state follows expiration.

Test harness timeouts are separate from production timeout policy.

### 11.22 Avoid Async Work While Holding Inconsistent State

Do not partially mutate shared state, await an operation, and then continue assuming the state is unchanged.

Prefer:

1. capture the required immutable input;
2. mark the explicit lifecycle transition;
3. await the operation;
4. verify the result is still current;
5. commit the resulting state atomically.

### 11.23 Make Busy State Reflect Real Exclusivity

A `busy` state or context key should correspond to an actual operation that prevents another user action.

Do not use one global busy flag for unrelated operations if they can safely occur independently.

Conversely, do not permit conflicting commands merely because they are implemented by separate functions.

### 11.24 Keep Concurrency Policy Near the State Owner

The component that owns the affected state should define how competing operations interact.

Do not distribute concurrency decisions across command callbacks and views.

For example, project open/close concurrency policy belongs with project lifecycle coordination rather than separately in the Open and Close command implementations.

### 11.25 Test Races Deliberately

Important asynchronous state owners require tests for realistic races, not only successful sequential behavior.

Examples include:

```text
close while open is pending
stale open response after close
service exits with pending request
duplicate service startup
extension disposal during service activity
out-of-order protocol responses
stale authoring revision
```

Use controlled promises, fake transports, or process boundaries rather than timing-dependent sleeps.

### 11.26 Concurrency Code Should Be Understandable

Prefer a small explicit state machine or operation token over clever promise chaining or implicit sequencing.

Concurrency correctness is more important than reducing line count.

Another developer should be able to determine:

- what operations may overlap;
- what supersedes what;
- who owns cancellation;
- how stale results are rejected;

without reconstructing behavior from incidental promise ordering.

## 12. Resource Ownership and Disposal

### 12.1 Every Resource Must Have an Owner

Every long-lived resource must have one clearly identifiable owner responsible for its lifecycle.

Examples include:

- Java child processes;
- protocol transports;
- protocol clients;
- subscriptions;
- event emitters;
- diagnostic collections;
- Output channels;
- tree providers;
- file watchers;
- timers.

Do not rely on another component to dispose a resource unless ownership has been explicitly transferred.

### 12.2 The Creator Normally Owns the Resource

As a default rule, the component that creates a resource owns and disposes it.

If ownership is transferred, make that transfer explicit in the API or architecture.

Do not create resources in one component and silently assume an unrelated component will eventually clean them up.

### 12.3 Do Not Dispose Injected Dependencies Unless Ownership Was Transferred

Receiving a dependency through a constructor or method does not normally imply ownership.

For example, a Project view receiving `ProjectState` must not dispose `ProjectState` unless the contract explicitly says the view owns it.

This prevents double disposal and unclear lifecycle relationships.

### 12.4 Use VS Code Disposal Conventions

Use `Disposable`, `EventEmitter`, `ExtensionContext.subscriptions`, and related VS Code lifecycle mechanisms where they are appropriate.

Do not create a parallel generic disposal framework.

JScene3D-specific lifecycle logic may coordinate these resources, but should use the host conventions rather than replacing them.

### 12.5 Register Extension-Lifetime Resources

Resources intended to live for the extension lifetime should be registered with the extension's lifecycle ownership.

Examples may include:

- command registrations;
- view registrations;
- Output channels;
- diagnostic collections;
- long-lived application services.

Do not register short-lived project resources as extension-lifetime resources merely for convenience.

### 12.6 Distinguish Extension, Service and Project Lifetimes

JScene3D has several distinct lifetimes:

```text
extension lifetime
    ↓
Java authoring-service lifetime
    ↓
project-session lifetime
    ↓
individual operation lifetime
```

Do not collapse these lifetimes.

For example, closing a project does not imply stopping the Java service.

Likewise, disposing the extension must eventually terminate resources from all shorter lifetimes.

### 12.7 Project-Scoped Resources Must Close with the Project

Resources associated with a particular Java project session must be invalidated or disposed when that project closes.

This includes project-derived:

- state;
- diagnostics;
- hierarchy snapshots;
- Inspector state;
- subscriptions;
- pending operations where applicable.

Do not leave project-scoped resources attached to a later project session.

### 12.8 Process Ownership Belongs to the Authoring Service Layer

The authoring-service integration owns the Java process lifecycle.

Views, commands, and project presentation must not:

- spawn Java directly;
- kill the Java process directly;
- inspect child-process handles;
- reconstruct process state.

They invoke authoring capabilities through the owning service.

### 12.9 Process Shutdown Must Be Orderly

Normal extension shutdown should prefer the defined protocol shutdown operation before terminating the child process.

Conceptually:

```text
service/shutdown
    ↓
protocol completion
    ↓
transport closes
    ↓
Java process exits
```

Use forced termination only when orderly shutdown is unavailable or fails according to an explicit policy.

### 12.10 Unexpected Process Exit Must Clean Up Dependents

When the Java authoring process exits unexpectedly:

- mark the service unavailable;
- close or invalidate the transport;
- reject pending protocol requests;
- invalidate project state owned by that service generation;
- release process-related resources;
- notify relevant state owners.

Do not leave the extension believing that the project session still exists.

### 12.11 Protocol Transport Owns Stream Resources

The transport layer owns the stream listeners and framing resources attached to the Java process communication channels.

Higher layers should not independently attach competing protocol parsers to stdout.

Java stdout is protocol-only.

Logging from Java stderr may be routed to Output by the process/service layer without becoming part of the protocol transport.

### 12.12 Subscriptions Must Be Disposable

Every long-lived subscription must return or otherwise have an explicit disposal mechanism.

The subscriber owns its subscription unless the API explicitly establishes different ownership.

Do not add listeners that remain registered indefinitely because the callback itself appears harmless.

### 12.13 Dispose Replaced Subscriptions

When state changes cause one subscription to replace another, dispose the previous subscription before or as part of installing the replacement.

This is particularly important for project-scoped and selection-scoped observation.

Do not accumulate listeners across project opens or Inspector target changes.

### 12.14 Avoid Anonymous Unowned Subscriptions

Avoid code such as:

```typescript
state.onDidChange(() => {
 // ...
});
```

when the returned disposable is ignored and the event source outlives the subscriber.

Store or register the disposable with the appropriate owner.

### 12.15 Event Emitters Must Be Disposed

A component that owns a VS Code `EventEmitter` also owns its disposal.

Expose the event, not the emitter itself.

For example:

```typescript
private readonly _onDidChangeState = new vscode.EventEmitter<ProjectState>();

readonly onDidChangeState = this._onDidChangeState.event;
```

Consumers must not be able to call `fire()`.

### 12.16 Output Channels Have Explicit Ownership

Create the JScene3D Output channel once at the appropriate extension/application boundary.

Pass the required logging capability to consumers rather than allowing each subsystem to create another `JScene3D` channel.

Dispose the channel when its owning extension lifetime ends.

### 12.17 Diagnostic Collections Have Explicit Ownership

Create the JScene3D diagnostic collection once for the relevant extension lifetime unless a concrete requirement justifies multiple collections.

Project lifecycle code controls project-scoped diagnostic contents.

Disposing the collection belongs to the component that created it.

Closing a project clears its diagnostics; it does not require destroying and recreating the collection.

### 12.18 Views Own Only Presentation Resources

A view may own:

- its event emitter;
- its tree provider resources;
- presentation subscriptions;
- view-specific caches.

It must not own the Java service or authoritative project session merely because it displays their state.

When a view is disposed, application state should not disappear unless the architecture explicitly defines that lifecycle.

### 12.19 Clear Timers and Watchers

Any timer, interval, file watcher, or similar background resource must have an explicit disposal path.

Do not leave timers running after:

- project close;
- service shutdown;
- extension deactivation;

when their owning lifecycle has ended.

### 12.20 Disposal Must Be Safe

Follow Code OSS conventions regarding repeated disposal.

Where JScene3D owns custom disposal logic, make it safe and predictable if cleanup paths converge.

Do not depend on a fragile assumption that only one failure or shutdown path can invoke cleanup.

### 12.21 Disposal Must Not Hide Failures

Cleanup failures that indicate an actual problem should be logged appropriately.

Do not silently swallow every exception during disposal merely because shutdown is occurring.

Likewise, avoid turning expected already-closed conditions into noisy user-facing errors.

### 12.22 Do Not Perform New Work During Disposal

Disposal is for terminating owned work and releasing resources.

Do not start replacement services, reopen projects, refresh views from Java, or schedule new long-lived operations while shutting down.

Late asynchronous callbacks must respect the disposed state.

### 12.23 Pending Requests Must Not Survive Their Transport

When a transport is disposed or fails, every pending protocol request associated with it must settle with failure.

Do not allow unresolved promises to remain after their communication channel no longer exists.

### 12.24 Resource Ownership Must Be Testable

Tests for lifecycle-owning components should verify cleanup behavior.

Important cases include:

- Java process shutdown;
- unexpected process exit;
- pending request rejection;
- subscription disposal;
- project close;
- extension disposal;
- repeated startup/shutdown where supported.

Do not rely solely on process exit at the end of the test runner to clean up resources.

### 12.25 Manual Tests Must Check for Leaked Processes

Any feature that starts or changes Java process lifecycle must include manual verification that the expected process remains or exits at the correct point.

For example:

```text
close project
    → authoring service remains alive

close Code OSS
    → authoring service exits
```

A successful UI interaction is not sufficient if it leaves orphan processes behind.

## 13. Events and Notifications

### 13.1 Use Events for State Observation

Use events when consumers need to observe changes owned by another component.

Typical examples include:

- service state changes;
- project state changes;
- diagnostics changes;
- hierarchy changes;
- Inspector state changes.

Do not use events as a substitute for ordinary method calls when one component is explicitly requesting an operation.

### 13.2 Events Describe What Changed

Event names and payloads should describe meaningful state changes.

Prefer:

```text
onDidChangeProject
onDidChangeServiceState
onDidChangeDiagnostics
```

over generic mechanisms such as:

```text
onUpdate
onRefresh
onNotification
```

Follow established VS Code `onDid...` / `onWill...` naming conventions where appropriate.

### 13.3 Expose Events, Not Emitters

A component that owns an event emitter controls publication.

Expose only the event to consumers.

```typescript
private readonly _onDidChangeState = new vscode.EventEmitter<ProjectState>();

readonly onDidChangeState = this._onDidChangeState.event;
```

Do not expose the emitter itself.

Consumers must not be able to publish another component's events.

### 13.4 Events Must Have a Clear Owner

The component owning the changed state should normally own the corresponding event.

For example:

```text
ProjectState
    owns project lifecycle state
    owns project-state change event
```

Do not create a central application event bus for unrelated JScene3D events.

### 13.5 Do Not Introduce a Global Event Bus

Avoid generic systems such as:

```text
JScene3DEventBus
GlobalEventManager
ApplicationEvents
```

for communication between unrelated components.

Global event buses hide dependencies, make lifecycle difficult to understand, and make tests harder to isolate.

Prefer explicit dependencies and events exposed by the state owner.

### 13.6 Keep Event Payloads Focused

An event payload should contain the information needed to understand the change without exposing unrelated application state.

Do not pass a large application context object with every event.

Where consumers can safely read the owner's current immutable state after notification, a small event or no payload may be sufficient.

### 13.7 Prefer State Events Over Imperative Refresh Events

Prefer notifying consumers that authoritative state changed rather than commanding them to perform presentation actions.

Prefer:

```text
project state changed
```

over:

```text
refresh Project tree now
```

The view decides how the new state affects its presentation.

This keeps state ownership separate from UI behavior.

### 13.8 Do Not Encode VS Code Presentation in Backend Events

Protocol, authoring-service, and project-state events must not describe UI actions such as:

```text
expand this tree node
focus this view
show this icon
refresh this control
```

Those decisions belong to the TypeScript presentation layer.

### 13.9 Distinguish Protocol Notifications from TypeScript Events

A Java protocol notification and an in-process TypeScript event are different boundaries.

Conceptually:

```text
Java protocol notification
        ↓
authoring service/client
        ↓
validated state transition
        ↓
TypeScript event
        ↓
presentation consumers
```

Do not expose raw protocol notifications directly to views.

Validate and interpret them at the appropriate service/state boundary first.

### 13.10 Do Not Treat Output Logging as an Event System

Writing to the JScene3D Output channel does not notify application components.

Likewise, application events should not exist merely to generate log messages.

Logging observes behavior; it does not coordinate it.

### 13.11 Do Not Treat VS Code Notifications as Application Events

`showInformationMessage`, `showWarningMessage`, and `showErrorMessage` are user-interface mechanisms.

They must not be used to coordinate application state.

A user notification may be produced as a consequence of a state transition or failed operation, but it is not the transition itself.

### 13.12 Fire Events After State Is Consistent

Update owned state before publishing the event that announces the change.

Consumers observing the event should see a coherent snapshot.

Avoid:

```text
fire event
    ↓
update half the state
    ↓
await
    ↓
update remaining state
```

unless the intermediate state is itself an intentional modeled lifecycle state.

### 13.13 Avoid Duplicate Notifications for One Transition

A single semantic state transition should not cause several equivalent events merely because several internal fields changed.

For example, opening a project should not independently publish:

```text
summary changed
generation changed
project ID changed
descriptor changed
project opened
```

when consumers fundamentally need one coherent project-state transition.

Use more granular events only when consumers genuinely need independent observation.

### 13.14 Do Not Fire Events When Nothing Changed

Avoid publishing change events when the observable state remains equivalent.

Unnecessary events cause:

- redundant view refreshes;
- harder-to-follow tests;
- unnecessary command/context updates;
- potential event loops.

Where determining equality is expensive or semantically unclear, prefer correctness over elaborate deduplication.

### 13.15 Avoid Event Chains for Sequential Operations

Do not implement ordinary workflows as long chains of unrelated event listeners.

For example, avoid:

```text
Open command
    → event
    → service listener
    → event
    → project listener
    → event
    → diagnostics listener
```

when a clear asynchronous operation can coordinate the workflow directly.

Events are for observation, not hidden control flow.

### 13.16 Keep Event Handling Fast

Synchronous event handlers should perform small state or presentation updates.

Do not perform expensive synchronous work inside an event callback.

If asynchronous work is required, its lifecycle and error handling must be explicit.

### 13.17 Async Event Work Must Handle Failure

If an event triggers asynchronous work, do not allow its promise to become unobserved.

Handle failure explicitly and ensure stale results cannot update state after the event's context is no longer current.

### 13.18 Prevent Event Feedback Loops

Be careful when a state change updates VS Code presentation and a VS Code event can in turn request another state change.

For example:

```text
Java hierarchy state
    ↓
TreeDataProvider refresh
    ↓
VS Code selection event
    ↓
Inspector target request
```

Define which transitions are authoritative and avoid accidentally feeding presentation synchronization back into domain mutation.

### 13.19 UI Selection Events Remain TypeScript-Side

Current VS Code selection belongs to the TypeScript presentation layer.

Selection changes may cause TypeScript to request an Inspector projection for a semantic target.

Do not send selection events to Java merely to mirror editor focus.

Java receives semantic targets only when an authoring operation requires them.

### 13.20 Protocol Notifications Must Be Versioned Contracts

When Java eventually emits notifications for hierarchy, revision, dirty state, diagnostics, runtime state, or other changes, those notifications are part of the wire protocol.

They require:

- explicit method names;
- explicit DTOs;
- runtime validation;
- compatibility rules;
- tests.

Do not add arbitrary notification payloads because an in-process TypeScript event happens to need similar data.

### 13.21 Subscriptions Must Be Disposable

Every long-lived event subscription must participate in explicit lifecycle management.

Register the returned disposable with the subscriber's owner.

Project-scoped subscriptions must not survive project close.

Extension-scoped subscriptions must not survive extension disposal.

### 13.22 Avoid Event Listener Leaks Across Project Sessions

Opening and closing projects repeatedly must not accumulate listeners.

Tests should cover repeated project lifecycle where subscriptions are project-scoped.

A listener associated with project generation N must not continue reacting to generation N+1.

### 13.23 Event Payloads Should Prefer Immutable Data

Event payloads should normally be immutable snapshots or stable identities.

Do not publish mutable internal objects that listeners can modify.

If consumers need current state, expose a readonly state query from the owner.

### 13.24 Events Should Be Testable Without UI Automation

State-owner events should be testable through ordinary unit tests.

Tests should be able to verify:

- when an event fires;
- what state is visible when it fires;
- that it does not fire unnecessarily;
- that subscriptions dispose correctly.

Do not require launching a VS Code window merely to test application-state events.

### 13.25 User Notifications Require a User-Relevant Reason

Native VS Code notifications should be reserved for information requiring user attention or action.

Do not display toast notifications for routine events such as:

```text
Java service started
project opened
project closed
hierarchy refreshed
```

Use Output, Problems, views, or status presentation as appropriate.

### 13.26 Avoid Duplicate Error Presentation

Do not present the same failure simultaneously through multiple intrusive mechanisms.

For example, a malformed project may reasonably produce:

```text
Problems
    detailed structured diagnostics

JScene3D Output
    operational context

error notification
    concise statement that the explicit Open Project action failed
```

The notification should not repeat every diagnostic already available in Problems.

### 13.27 Notifications Must Not Replace Diagnostics

Project validation problems belong in VS Code Problems when structured diagnostics are available.

Do not use a series of error notifications as a replacement for diagnostic publication.

### 13.28 Notifications Must Not Replace Output Logging

Technical lifecycle and troubleshooting details belong in the JScene3D Output channel.

Do not expose stack traces, protocol payloads, process command lines, or verbose technical details in user notifications.

### 13.29 Notification Actions Must Be Real Actions

If a notification includes buttons or actions, each action must perform a clear supported operation.

Do not add speculative actions such as `Retry`, `Recover`, or `Restart` until those lifecycle behaviors are actually defined and tested.

### 13.30 Keep Notification Policy Consistent

Similar failures should be presented consistently.

The decision between:

- Problems;
- Output;
- warning notification;
- error notification;
- silent state update;

should depend on the failure category and user impact, not on which implementation file detected it.

## 14. Error Handling

### 14.1 Distinguish Failure Categories

Do not treat every failure as the same kind of error.

At minimum distinguish between:

- expected JScene3D domain or validation failures;
- protocol errors;
- protocol compatibility failures;
- transport failures;
- Java process failures;
- VS Code integration failures;
- unexpected programming errors.

The handling and user presentation should reflect the category.

### 14.2 Domain Diagnostics Are Not Exceptions

An invalid or malformed JScene3D project is an expected domain outcome.

When Java returns structured project diagnostics, preserve and publish those diagnostics.

Do not convert ordinary project validation failures into generic TypeScript exceptions merely because the requested operation could not complete.

### 14.3 Technical Failures Should Fail Explicitly

Infrastructure failures such as:

- malformed protocol frames;
- invalid JSON-RPC envelopes;
- incompatible protocol versions;
- unexpected Java process termination;
- broken transport;
- invalid wire DTOs;

must produce explicit technical failures.

Do not silently continue with partial or guessed state.

### 14.4 Do Not Swallow Errors

Avoid empty or effectively empty catch blocks.

Do not write:

```typescript
try {
 await operation();
} catch {
 // ignore
}
```

unless ignoring the specific failure is an intentional and documented part of the contract.

Expected cleanup conditions may be handled quietly when they are genuinely harmless.

### 14.5 Catch Errors at the Layer That Can Handle Them

Do not catch an error merely to log it and immediately throw an equivalent error again.

Catch when the current layer can:

- translate the error into a more appropriate abstraction;
- restore or invalidate owned state;
- add meaningful operational context;
- publish appropriate diagnostics;
- present the failure to the user;
- perform required cleanup.

Otherwise allow the failure to propagate to the owner that can handle it.

### 14.6 Preserve the Original Cause

When translating an unexpected technical failure, preserve the original cause where supported by the repository/runtime conventions.

Do not replace useful technical information with a generic message and lose the underlying failure.

User-facing presentation may remain concise while Output or debugging information retains the technical cause.

### 14.7 Do Not Parse Error Messages for Program Logic

Human-readable messages are not stable machine contracts.

Do not write logic such as:

```typescript
if (error.message.includes('project already open')) {
 // ...
}
```

Use:

- structured protocol error codes;
- discriminated error types;
- explicit state;
- stable machine-readable fields.

### 14.8 Use Structured Protocol Errors

JSON-RPC and authoring-service errors should retain their structured protocol identity.

Feature code should be able to distinguish, where relevant:

```text
method not found
invalid request
invalid parameters
project operation rejected
protocol incompatibility
internal service failure
```

without parsing message text.

### 14.9 Validate Error Payloads Too

Protocol error responses are external data and require runtime validation just like successful responses.

Do not assume an error-shaped JSON object is valid merely because the request failed.

Malformed protocol error data is itself a protocol failure.

### 14.10 Invalid Wire Data Is a Protocol Failure

If Java returns a response that does not satisfy the agreed DTO contract, do not fill missing fields with invented defaults.

Fail the operation explicitly and record enough information for troubleshooting.

The TypeScript client must not silently normalize incompatible protocol versions into apparent success.

### 14.11 Keep User Messages Concise

User-facing notifications should explain:

- what operation failed;
- what the user can do next, when applicable;
- where additional information is available.

For example:

```text
JScene3D could not open the project. See Problems and JScene3D Output for details.
```

Do not expose stack traces or protocol internals in notifications.

### 14.12 Put Technical Context in Output

Operational context useful for troubleshooting belongs in the JScene3D Output channel.

Examples include:

- service startup failure;
- protocol initialization failure;
- unexpected Java process exit;
- failed project operation;
- Java stderr;
- cleanup failure.

Do not require users to open developer tools merely to understand ordinary JScene3D operational failures.

### 14.13 Publish Structured Project Problems Through Diagnostics

When Java supplies structured diagnostics, use VS Code Problems.

Do not reduce a set of project diagnostics to one generic error message.

Preserve:

- severity;
- code;
- source;
- location information available from Java;
- message.

### 14.14 Do Not Invent Diagnostic Precision

If Java provides a source URI and JSON location but no reliable line and column, do not pretend TypeScript knows the exact source range.

Use the documented conservative mapping until the protocol supplies precise coordinates.

### 14.15 State Must Reflect Failure

When an operation fails, update owned state to reflect the actual outcome.

For example, a failed `project/open` must not leave:

```text
project state = open
```

merely because some earlier local transition occurred.

Likewise, unexpected service termination must invalidate project state that depended on that process.

### 14.16 Failure Cleanup Must Be Deterministic

Error paths must release or invalidate resources consistently.

Examples include:

- reject pending protocol requests;
- remove stream listeners;
- clear project-scoped state after fatal service loss;
- dispose replaced subscriptions;
- terminate failed startup processes where owned.

Do not implement cleanup only on the successful path.

### 14.17 Do Not Hide Partial Success

If an operation performed a meaningful side effect before another step failed, do not report the entire operation as though nothing happened.

For example, if Java successfully opened a project but a subsequent TypeScript presentation step fails, Java still owns an open project session.

Recovery must account for the actual backend state.

### 14.18 Avoid Catch-All Recovery

Do not automatically:

- restart Java;
- reopen projects;
- retry mutations;
- recreate workspaces;
- clear user state;

after every failure.

Recovery behavior must be explicitly designed for the failure category.

Until recovery is defined, prefer a clear failed state over speculative automatic behavior.

### 14.19 Do Not Retry Non-Idempotent Operations Automatically

Operations such as:

- mutation;
- save;
- undo;
- redo;
- project close;

may change authoritative state.

Do not retry them automatically after an ambiguous transport failure unless the protocol defines idempotency or another mechanism that makes the retry safe.

### 14.20 Treat Unknown State as Unknown

If the transport fails after sending an operation but before receiving its response, do not assume whether Java applied the operation.

The client must not invent authoritative state.

A later synchronization/recovery mechanism may resolve the uncertainty.

### 14.21 Expected Cancellation Is Not an Error

When cancellation is part of the defined operation semantics, do not log or present it as an unexpected failure.

Distinguish:

```text
user cancelled file picker
```

from:

```text
project open failed
```

Do not generate error notifications when the user simply cancels an operation before it begins.

### 14.22 Programming Errors Should Remain Visible

Do not convert obvious programming defects into ordinary domain failures.

Examples include:

- impossible state transitions;
- violated internal invariants;
- unexpected exhaustive-union cases;
- misuse of disposed resources.

These should fail visibly during development and testing.

Do not hide them behind generic `try/catch` blocks that make the application appear to continue normally.

### 14.23 Assertions Are for Internal Invariants

If Code OSS conventions provide an assertion mechanism, use assertions only for conditions that represent programmer errors or impossible internal states.

Do not assert on:

- malformed user projects;
- unavailable Java services;
- protocol input from another process;
- filesystem conditions;

when those can legitimately fail at runtime.

### 14.24 Error Translation Should Happen Once

Avoid repeatedly wrapping the same failure at every layer.

A low-level transport error may become a meaningful authoring-service failure at the service boundary.

Higher layers should normally preserve that structured failure rather than repeatedly translating it into new generic errors.

### 14.25 Logging an Error Does Not Mean It Was Handled

A catch block that only writes to Output has not necessarily restored application state or informed the caller.

After logging, either:

- recover completely;
- return an explicit failure outcome;
- or propagate the error.

Do not leave callers assuming success.

### 14.26 Error Handling Must Be Tested

Important failure paths require focused automated tests.

Examples include:

- malformed framing;
- invalid JSON;
- invalid DTO;
- incompatible initialization;
- protocol error response;
- Java process exit;
- pending-request rejection;
- failed project open;
- stale asynchronous result;
- disposal during activity.

Tests should verify both the reported failure and the resulting state.

### 14.27 Manual Testing Must Include Failure Cases

Features with meaningful user-visible failures must include manual test instructions for representative failure paths.

For project opening, this includes at least:

```text
valid project
malformed descriptor
semantically invalid project
```

Manual verification should confirm:

- visible state;
- Problems;
- JScene3D Output;
- notifications;
- process lifecycle.

Successful-path testing alone is insufficient.

## 15. Logging, Output and User Notifications

### 15.1 Use the Appropriate VS Code Surface

Different information belongs in different native VS Code surfaces.

Use:

```text
JScene3D Output
    operational and troubleshooting information

Problems
    structured project and authoring diagnostics

Notifications
    important user-action failures or information requiring attention

Views
    normal feature and project state
```

Do not create custom UI for information already handled well by these mechanisms.

### 15.2 Use One JScene3D Output Channel

Use a single Output channel named:

```text
JScene3D
```

unless a future requirement provides a strong reason for another channel.

Do not create separate channels for:

- protocol;
- Java process;
- project loading;
- hierarchy;
- Inspector;
- runtime.

A single channel gives users one predictable place to troubleshoot JScene3D.

### 15.3 Output Is Operational Logging

Use Output for meaningful lifecycle and operational events such as:

```text
authoring service starting
authoring service initialized
project opening
project opened
project closing
project closed
service shutdown
unexpected service termination
protocol initialization failure
Java stderr
```

Do not use Output as a dump of every internal method call.

### 15.4 Log at Useful Boundaries

Prefer logging significant operations rather than implementation details.

For example:

```text
Opening project: /projects/example/game.j3d
Project opened: Example Game
```

is useful.

Logging every DTO validation step, event publication, or tree refresh normally is not.

### 15.5 Do Not Log Every Protocol Message by Default

Normal operation must not dump all JSON-RPC requests and responses.

Protocol payloads may become:

- large;
- repetitive;
- difficult to read;
- potentially sensitive;
- expensive to log.

If protocol tracing is later required for development, make it an explicit diagnostic mode rather than normal Output behavior.

### 15.6 Never Log Raw Framing Data in Normal Operation

Do not log:

- `Content-Length` parsing details;
- raw byte buffers;
- partial frame contents;
- every stdout chunk.

Framing details belong in focused tests and optional low-level diagnostics.

### 15.7 Java `stdout` Is Protocol-Only

Never treat Java `stdout` as ordinary logging.

The authoring-service protocol owns stdout.

Unexpected non-protocol stdout must be treated as a protocol/transport problem rather than displayed as harmless logging.

### 15.8 Java `stderr` Is Operational Information

Java `stderr` may be routed to JScene3D Output.

Make its origin clear, for example:

```text
[Java] ...
```

Do not interpret arbitrary stderr text as structured protocol state.

Do not make TypeScript behavior depend on parsing Java log messages.

### 15.9 Add Context to Failures

When logging an operation failure, include enough context to identify the failed operation.

Prefer:

```text
Failed to open project: /projects/example/broken.j3d
```

over:

```text
Operation failed
```

Do not repeat large diagnostic sets when those diagnostics are already available in Problems.

### 15.10 Do Not Log Secrets or Excessive Environment Information

Do not dump:

- complete environment variables;
- authentication tokens;
- arbitrary user configuration;
- unrelated filesystem information;
- complete process environments.

Log only information needed to understand JScene3D behavior.

### 15.11 Be Careful with User Paths

Paths are often necessary for project and process troubleshooting and may be logged when relevant.

Do not log unrelated filesystem paths or recursively dump directory contents.

Protocol or diagnostic logging must not accidentally expose more filesystem information than the operation itself requires.

### 15.12 Keep Log Messages Stable and Readable

Operational messages should be concise and understandable.

Prefer consistent terminology:

```text
Authoring service
Project
Hierarchy
Inspector
Play
Runtime
```

Do not alternate between several names for the same component.

Logs are primarily for people, not a machine-readable API.

### 15.13 Do Not Parse Output Logs

Output text is not an application contract.

Tests may verify that important logging occurred where useful, but production behavior must not parse previously emitted log messages.

### 15.14 Problems Own Structured Diagnostics

Project and authoring diagnostics supplied by Java should be published through the VS Code diagnostics API.

Output may summarize the operation:

```text
Project open failed with 3 errors and 1 warning.
```

but Problems should contain the individual structured diagnostics.

### 15.15 Do Not Duplicate Every Diagnostic in Output

Avoid printing the full diagnostic collection to Output by default when the same information is already available in Problems.

Output should provide operational context around the diagnostic-producing operation.

Detailed diagnostic duplication may be appropriate only when Problems cannot represent important information.

### 15.16 Notifications Are for User Attention

Use native VS Code notifications when an event requires immediate user awareness or action.

Typical examples include:

- an explicit Open Project operation failed;
- the authoring service could not start;
- the active authoring service terminated unexpectedly;
- a requested operation cannot proceed.

Do not show notifications for ordinary successful lifecycle events.

### 15.17 Avoid Notification Noise

Do not show toast notifications for:

```text
project opened
project closed
service initialized
hierarchy refreshed
Inspector updated
diagnostics changed
```

Normal state should be visible through the appropriate views and editor surfaces.

### 15.18 User Cancellation Is Usually Silent

If the user cancels:

- a file picker;
- a confirmation dialog;
- another operation before it begins;

do not display an error notification.

Cancellation is not failure.

### 15.19 Notifications Should Be Concise

A notification should explain the immediate outcome without reproducing technical details.

Prefer:

```text
JScene3D could not open the project. See Problems and JScene3D Output for details.
```

over a large message containing:

- stack traces;
- protocol codes;
- JSON locations;
- Java exception details.

### 15.20 Use Severity Appropriately

Use:

- information notifications for genuinely useful informational events requiring attention;
- warnings for recoverable or potentially problematic conditions;
- errors when an explicit operation failed or an important capability became unavailable.

Do not classify every unusual condition as an error.

### 15.21 Do Not Use Notifications as Status Indicators

Do not use repeated notifications to indicate long-running state.

Use:

- progress APIs;
- status presentation;
- views;
- Output;

when those mechanisms better represent ongoing activity.

### 15.22 Notification Actions Must Be Supported

Do not add actions such as:

```text
Retry
Restart
Recover
Reopen
```

until the corresponding lifecycle behavior is explicitly implemented and tested.

A button that merely repeats an unsafe or undefined operation is worse than no button.

### 15.23 Do Not Automatically Reveal Output for Routine Events

Do not force the Output panel open whenever JScene3D writes a message.

Users should not lose focus because routine operational information was logged.

Automatically revealing Output may be appropriate for exceptional failures where no better native presentation exists, but should be used sparingly.

### 15.24 Do Not Automatically Reveal Problems for Every Diagnostic

Publishing diagnostics is normally sufficient.

Do not repeatedly force the Problems panel open whenever diagnostics change.

An explicit failed user operation may direct the user to Problems through a concise notification.

### 15.25 Logging Must Not Change Application Behavior

Adding or removing a log statement must not affect:

- protocol timing;
- state transitions;
- command enablement;
- project lifecycle;
- error handling.

Do not rely on logging callbacks or Output visibility to coordinate work.

### 15.26 Keep Logging Dependencies Narrow

Low-level components should not require direct access to the entire VS Code window API merely to log.

Pass the narrow logging capability appropriate to the component where useful.

Do not create an elaborate logging abstraction merely to wrap one Output channel.

### 15.27 Process Logging Must Preserve Stream Separation

Keep these concepts distinct:

```text
Java stdout
    protocol

Java stderr
    Java operational logging

TypeScript operational events
    JScene3D Output
```

Do not merge stdout and stderr before protocol processing.

### 15.28 Unexpected Failures Need Troubleshooting Information

When an unexpected technical failure occurs, Output should contain enough information for development and support diagnosis.

This may include:

- operation;
- error category;
- error message;
- underlying cause where appropriate;
- Java exit code/signal;
- relevant protocol state.

Do not expose unnecessary implementation detail in user notifications.

### 15.29 Logging Should Be Testable at Important Boundaries

Tests may verify important operational logging where it forms part of expected troubleshooting behavior.

Examples include:

- service startup;
- project open failure;
- unexpected process termination.

Do not write brittle tests asserting every log line or exact incidental wording.

### 15.30 Manual Test Instructions Must Include Observability

When a feature changes project, service, protocol, or runtime lifecycle, its manual test instructions must state what the tester should observe in:

```text
JScene3D Output
Problems
relevant JScene3D views
notifications
```

where applicable.

Manual testing should verify not only that the operation works, but that failures and lifecycle state are visible through the intended native VS Code surfaces.

## 16. VS Code API Usage

### 16.1 Prefer Public VS Code Extension APIs

JScene3D functionality implemented as a built-in extension should use the normal VS Code extension APIs wherever they provide the required capability.

Prefer the same APIs that an ordinary extension would use unless there is a demonstrated requirement that cannot be implemented through them.

Do not modify Code OSS internals merely because JScene3D is bundled with the product.

### 16.2 Privileged Code OSS Changes Require Justification

A change outside the built-in JScene3D extension requires an explicit architectural reason.

Valid reasons may include:

- native viewport embedding that cannot be implemented through extension APIs;
- product-level extension policy;
- application packaging;
- functionality genuinely unavailable to extensions.

Convenience is not sufficient justification.

### 16.3 Use Native Commands

Register user actions through the VS Code command API.

Use commands for operations such as:

```text
Open Project
Close Project
Save
Undo
Redo
Play
Pause
Stop
```

when those capabilities exist.

Do not create a parallel JScene3D command registry.

### 16.4 Use Context Keys for Contribution State

Use VS Code context keys for declarative command/menu/view enablement and visibility.

Context keys should reflect application state owned elsewhere.

For example:

```text
jscene3d.projectOpen
jscene3d.projectBusy
```

Do not treat context keys as authoritative project state.

### 16.5 Keep Project Semantics Independent of Code OSS Workspace State

The active JScene3D Project is a Java-owned semantic session, not a Code OSS workspace folder.

Project open, replacement, close, and automatic reopen must use explicit descriptor and Java-authoritative root URIs. They must not change `workspaceFolders`, reload the workbench, or restart the extension host.

Use native workspace facilities only for optional integrations that actually require them. Terminal, Git/SCM, and Search integration must remain separate from Project correctness.

### 16.6 Java Determines the Project Root

When Java successfully opens a JScene3D project and returns its canonical project root, treat that Java result as authoritative.

Do not independently derive the project root in TypeScript from the selected descriptor path and assume both results are equivalent.

Pass the Java-returned root explicitly to Project-root integrations. Do not require it to equal the current Code OSS workspace root.

### 16.7 Workspace Changes Must Not Drive Project Lifecycle

Changing the Code OSS workspace can affect:

- extension-host lifecycle;
- extension activation;
- open editors;
- commands;
- views;
- Java process ownership;
- current in-memory project state.

Do not call workspace-changing APIs as an incidental side effect of Project open, replacement, close, or automatic reopen.

If a future optional integration changes workspace folders, design and test that integration independently of the semantic Project-session lifecycle.

### 16.8 Use Native File and Folder Pickers

Use VS Code file/folder selection APIs for user-driven project selection.

Do not implement a custom file browser.

Filters may restrict selection to relevant project descriptors where appropriate.

User cancellation should remain a normal silent outcome.

### 16.9 Use Native Tree APIs

Project, Hierarchy, and other tree-based views should use the VS Code tree APIs.

TypeScript owns:

- `TreeDataProvider`;
- `TreeItem`;
- expansion;
- reveal;
- context values;
- icons;
- command bindings;
- presentation refresh.

Java supplies authoring/domain data, not VS Code tree objects.

### 16.10 Tree Providers Must Be Presentation Adapters

A tree provider should adapt authoritative state into VS Code tree presentation.

It must not:

- parse `.j3d`;
- launch Java;
- validate project data;
- own Java project sessions;
- perform domain mutations directly.

User actions initiated from a tree should invoke explicit commands or authoring operations.

### 16.11 Use Native Diagnostics

Publish structured JScene3D project and authoring diagnostics through `DiagnosticCollection`.

Do not create a custom Problems view.

Preserve Java diagnostic information as faithfully as the VS Code diagnostic model permits.

### 16.12 Use Native Output Channels

Use the native Output API for JScene3D operational logging.

Do not create a custom log console.

Maintain one normal JScene3D Output channel unless a future requirement clearly justifies separation.

### 16.13 Use Native Notifications

Use VS Code information, warning, and error notifications for user-relevant events requiring attention.

Do not implement custom notification UI for ordinary extension operations.

Do not use notifications for routine successful state changes.

### 16.14 Use Native Progress APIs When Needed

When an operation becomes long enough that users need progress feedback, use VS Code's progress APIs.

Do not create custom loading overlays or progress systems.

Do not add progress UI pre-emptively to operations that complete quickly and already expose adequate state.

### 16.15 Use Native Configuration APIs for Editor Configuration

JScene3D editor/extension preferences should use VS Code configuration mechanisms where appropriate.

Do not confuse these with JScene3D project settings, which remain Java-authoritative project data.

Conceptually:

```text
VS Code configuration
    editor/client preference

JScene3D project settings
    project/domain configuration
```

Do not silently mirror one into the other.

### 16.16 Use `Uri` at VS Code Boundaries

Use `vscode.Uri` where interacting with VS Code workspace, documents, diagnostics, and resources.

Convert to the protocol representation at the authoring-service boundary.

Do not make low-level protocol code depend on `vscode.Uri`.

### 16.17 Respect Remote and URI Semantics

Do not assume every VS Code resource is represented by a local filesystem path unless the JScene3D capability explicitly requires a local project.

Where the Java authoring service requires local filesystem access, validate that requirement at the appropriate boundary and fail clearly for unsupported resource schemes.

Do not scatter `fsPath` assumptions throughout presentation code.

### 16.18 Use VS Code Disposal Patterns

Registrations returned by VS Code APIs must participate in explicit disposal.

This includes:

- commands;
- views;
- event subscriptions;
- diagnostic collections;
- Output channels;
- watchers.

Register resources with the correct lifecycle owner.

### 16.19 Do Not Reach into VS Code Internals from the Extension

Do not import private implementation modules from `src/vs/...` into the built-in JScene3D extension merely because the source is available in the same repository.

Use the extension API unless an explicitly reviewed architectural requirement demands privileged integration.

### 16.20 Built-In Does Not Mean Special-Case by Default

Being bundled with Code OSS does not justify bypassing normal extension boundaries.

The built-in extension should remain as close as practical to an ordinary well-behaved VS Code extension.

This improves:

- maintainability;
- testability;
- portability;
- understanding of dependencies;
- future upgrade work.

### 16.21 Use Product-Level Changes Only for Product-Level Concerns

Changes to Code OSS product configuration are appropriate for concerns such as:

- bundling the JScene3D extension;
- required built-in extensions;
- product identity;
- supported platform packaging.

Do not move feature implementation into product configuration or core workbench code.

### 16.22 Keep View Identity Stable

View IDs, command IDs, and context keys become internal contracts between:

- extension manifests;
- TypeScript code;
- menus;
- tests;
- product configuration.

Choose stable semantic identifiers and avoid renaming them casually.

### 16.23 Do Not Encode Presentation State in Java

VS Code-specific state such as:

```text
tree expansion
current focused view
selected tree row
visible Inspector section
active editor tab
context-menu state
```

belongs to TypeScript/VS Code.

Do not add protocol methods merely to mirror these presentation details into Java.

### 16.24 Send Semantic Targets to Java

When a VS Code interaction requires Java authority, send the semantic authoring target.

For example:

```text
selected hierarchy row
    ↓
HierarchyOccurrenceId / InspectorTarget
    ↓
Java Inspector projection
```

Do not send `TreeItem`, view IDs, row indices, or labels as domain identity.

### 16.25 Do Not Duplicate VS Code State Without Need

If VS Code already owns information such as:

- current workspace folders;
- active text editor;
- visible view;
- selected resource;

query or observe the appropriate API rather than maintaining an unnecessary parallel copy.

Cache only when there is a concrete lifecycle or performance reason.

### 16.26 Use VS Code Events Rather Than Polling

Observe workspace, configuration, document, and editor changes through the provided event APIs.

Do not periodically poll VS Code state to detect changes.

### 16.27 Avoid Excessive Command Indirection

A user action should not pass through several JScene3D command layers before reaching the owning operation.

Use commands as the VS Code entry point, then delegate to the appropriate state/service owner.

Do not use commands as a general internal message bus.

### 16.28 Do Not Invoke Commands to Call Internal Code

If two JScene3D TypeScript components need to collaborate, use an explicit dependency or operation.

Do not call:

```typescript
vscode.commands.executeCommand(...)
```

merely to invoke another internal JScene3D implementation.

Command execution is appropriate when the command itself is the intended VS Code integration boundary.

### 16.29 Keep Command Handlers Thin

Command handlers should normally:

1. obtain user input where necessary;
2. invoke the appropriate application operation;
3. handle the user-facing result.

They should not contain substantial protocol, validation, or state-management logic.

### 16.30 Use Native Workspace Trust Mechanisms Where Applicable

If JScene3D functionality executes project-controlled or otherwise trusted code in future runtime/Play workflows, integrate with the relevant VS Code workspace trust/security mechanisms where applicable.

Safe authoring must remain distinct from trusted runtime execution.

Do not introduce execution during project loading merely because the workspace is trusted.

### 16.31 Prefer Standard Editor Behavior

When deciding how JScene3D should behave, prefer behavior users already understand from VS Code where it does not conflict with JScene3D requirements.

Examples include:

- Problems for diagnostics;
- Explorer for files;
- commands and context menus for actions;
- Output for operational logs;
- workspace folders for project filesystem visibility.

JScene3D-specific UI should exist where the domain genuinely requires it, such as Hierarchy and Inspector.

### 16.32 Manual Testing Must Exercise the Real VS Code Surface

When a feature integrates with VS Code APIs, manual test instructions must tell the tester exactly how to exercise and observe the real UI behavior.

For example:

```text
1. Run the POC.
2. Execute JScene3D: Open Project.
3. Select the specified `.j3d` fixture.
4. Confirm the project root appears in Explorer.
5. Confirm the Project view reflects the opened project.
6. Open Problems and verify the expected diagnostics.
7. Open JScene3D Output and verify the lifecycle messages.
```

Do not treat unit tests of an adapter as sufficient evidence that the actual VS Code integration behaves correctly.

## 17. Extension Activation and Lifecycle

### 17.1 Keep Activation Focused

Extension activation is the composition root for JScene3D TypeScript services.

Its primary responsibilities are:

- create extension-lifetime resources;
- connect dependencies;
- invoke feature registrations;
- compose genuine cross-feature lifecycle boundaries;
- register returned services and feature disposables.

Do not place feature implementations directly in `activate()`.

### 17.2 Activation Must Not Perform Unnecessary Work

Do not start expensive or external resources merely because the extension activated.

In particular, do not start the Java authoring service until a JScene3D operation actually requires it unless a concrete requirement later justifies eager startup.

Activation should remain fast.

### 17.3 Java Service Startup Is Lazy

The persistent Java authoring service should normally start on first use.

For example:

```text
extension activates
    ↓
no Java process yet

Open Project
    ↓
ensure authoring service started
    ↓
initialize protocol
    ↓
perform project operation
```

Once started, the service may remain alive for the extension lifetime according to the defined lifecycle.

### 17.4 Service Startup Must Be Idempotent

Multiple callers requesting the authoring service concurrently must not create multiple Java processes.

The service owner must coordinate startup and expose one coherent ready/failure outcome.

### 17.5 Project Lifecycle Is Separate from Extension Lifecycle

Opening or closing a JScene3D project does not activate or deactivate the extension.

Likewise:

```text
Close Project
```

must not imply:

```text
stop authoring service
```

unless the lifecycle policy is explicitly changed later.

### 17.6 Project Lifecycle Must Preserve the Workbench

Opening, replacing, or closing a JScene3D Project must not establish or remove Code OSS workspace folders.

Keep the workbench, extension host, and authoring-service process stable across ordinary Project operations. Application restart recovery is a separate lifecycle that establishes fresh Java authority from stable persisted Project identity.

### 17.7 Do Not Infer an Open JScene3D Project from Workspace Alone

A Code OSS workspace folder and an active Java authoring project session are related but distinct concepts.

Do not assume:

```text
workspace folder exists
    ⇒
Java project is open
```

Likewise, do not assume any arbitrary workspace folder is a JScene3D project.

Java remains authoritative for opening and validating the JScene3D project.

### 17.8 Do Not Infer Project Root from Descriptor Path Independently

After Java successfully opens a Project, use the canonical Project root returned by Java for any Project-root integration.

Do not independently calculate the Project root from the selected `.j3d` path and treat that calculation as authoritative.

### 17.9 Extension Restart Must Have a Defined Recovery Path

When application or extension-host restart loses in-memory state, the extension must not depend on old Java authority.

Before implementing automatic recovery, define what durable information is required to reconnect or reopen the project safely.

Do not persist Java process handles, protocol request IDs, or other process-local state.

### 17.10 Persist Only What Is Required to Re-Establish Intent

For Project reopen across application or extension-host restart, persist only stable information necessary to re-establish the user's intent, such as Project identity and descriptor/root URIs.

After restart:

```text
stable project identity
    ↓
start fresh Java service
    ↓
initialize
    ↓
project/open
    ↓
receive new generation and authoritative state
```

Do not restore stale Java generations or revisions from persistence as though the old Java session still exists.

### 17.11 Activation Must Tolerate No Project

The extension must operate correctly when:

```text
no workspace is open
no JScene3D project is open
Java service has not started
```

This is a normal state.

Commands and views should reflect it without producing errors.

### 17.12 Activation Must Tolerate Non-JScene3D Workspaces

The built-in extension may activate in a Code OSS window whose workspace is not a JScene3D project.

Do not automatically send arbitrary workspace folders to Java for validation unless that behavior is explicitly part of project discovery.

JScene3D-specific commands may remain available where appropriate.

### 17.13 Keep Registration Deterministic

Register each command, view, provider, and extension-lifetime resource once.

Do not conditionally register duplicate commands or providers each time a project opens.

Project state should change the behavior or visibility of existing registrations through state and context keys.

### 17.14 Context Keys Must Be Initialized

Set JScene3D context keys to a coherent initial state during activation.

Do not rely on undefined context-key values accidentally producing the desired contribution behavior.

Update context keys from authoritative TypeScript application state.

### 17.15 Deactivation Must Dispose Extension-Owned Resources

Extension shutdown must cleanly dispose resources owned by the extension lifetime.

This includes, as applicable:

- command registrations;
- views/providers;
- subscriptions;
- diagnostic collections;
- Output channels;
- protocol clients;
- Java process ownership.

Use the normal VS Code disposal lifecycle.

### 17.16 Deactivation Should Request Orderly Java Shutdown

If the Java authoring service is running, normal extension shutdown should request:

```text
service/shutdown
```

before falling back to process termination.

Do not leave an authoring-service process orphaned after Code OSS exits.

### 17.17 Deactivation Must Not Start Recovery

Shutdown is not a service-failure recovery event.

Do not:

- restart Java;
- reopen the project;
- recreate views;
- schedule reconnect attempts;

while the extension is deactivating.

### 17.18 Late Results Must Not Reactivate Disposed State

An asynchronous operation completing after extension disposal must not:

- repopulate project state;
- publish diagnostics;
- update context keys;
- refresh views;
- start another Java process.

Lifecycle owners must guard against late completion.

### 17.19 Unexpected Service Exit Is Not Extension Deactivation

If Java exits unexpectedly while Code OSS remains active:

```text
extension remains active
service becomes failed/stopped
project session becomes invalid
```

Handle that through authoring-service and project lifecycle state.

Do not dispose the entire extension merely because the child process failed.

### 17.20 Restart Policy Must Be Explicit

Do not automatically restart Java in a loop after unexpected termination.

A future restart/recovery policy may define:

- when restart occurs;
- whether the project is reopened;
- how state is resynchronized;
- how repeated failures are limited.

Until then, a later explicit user operation may start a fresh service according to the defined service behavior.

### 17.21 Project Close Must Be Explicit

Closing a JScene3D project should perform the defined project lifecycle transition.

At minimum:

```text
project/close
    ↓
invalidate project-scoped TypeScript state
    ↓
clear project diagnostics
    ↓
reset project-dependent views/context
```

Do not treat closing the workspace folder, closing a text editor, or hiding a JScene3D view as automatically equivalent unless explicitly designed that way.

### 17.22 Workspace and Project Close Are Independent

Closing or changing the Code OSS workspace must not implicitly close the active JScene3D Project. Closing a JScene3D Project must not open an empty Code OSS window or otherwise mutate workspace state.

Window or extension shutdown remains responsible for orderly Project-session and Java-process disposal.

### 17.23 One Project Session for the Initial Architecture

Until multi-project support is explicitly designed, maintain at most one active JScene3D authoring project session per relevant extension instance.

Do not accidentally infer multi-project support from VS Code's ability to have multiple workspace folders.

A future multi-root JScene3D architecture requires an explicit protocol and state design.

### 17.24 Activation Code Must Remain Readable

Another developer should be able to inspect `activate()` and understand:

```text
what major components exist
who owns them
how they are connected
what is registered
what is disposed
```

without reading implementation details.

If activation becomes difficult to understand, extract coherent construction/wiring helpers rather than hiding the graph behind a service locator.

### 17.25 Avoid Extension-Level Mutable Globals

Do not store extension lifecycle state in exported module-level mutable variables.

Construct the state during activation and pass dependencies explicitly.

If a VS Code callback requires access to a service, capture the explicitly owned instance in the registered callback.

### 17.26 Activation and Deactivation Require Tests

Where practical, test lifecycle-sensitive behavior through focused boundaries.

Important cases include:

- extension activates with no project;
- first operation starts one Java service;
- repeated operations do not duplicate the service;
- project close leaves the service alive;
- service failure invalidates project state;
- extension disposal shuts down the service;
- no Java process remains after normal POC shutdown.

Do not require full UI automation for logic that can be tested through service/state boundaries.

### 17.27 Manual Test Instructions Must Cover Lifecycle

Changes affecting activation, workspace handling, project lifecycle, or Java process lifecycle must include explicit manual testing instructions.

The instructions must state:

- how to launch the correct POC;
- what command to execute;
- what project/fixture to use;
- what should appear in the relevant views;
- what should appear in Problems and Output;
- whether the Java process should be running at each lifecycle point;
- what should happen on project close;
- what should happen on Code OSS shutdown.

Do not report lifecycle work complete without giving the developer a reproducible manual verification procedure.

## 18. Commands and Context Keys

### 18.1 Commands Represent User Actions

Use VS Code commands as the entry points for explicit user actions.

Examples include:

```text
Open Project
Close Project
Save
Revert
Undo
Redo
Play
Pause
Resume
Stop
```

A command should describe the action being requested, not the UI element from which it was invoked.

### 18.2 Use the JScene3D Command Namespace

JScene3D commands must use the established namespace:

```text
jscene3d.*
```

For example:

```text
jscene3d.openProject
jscene3d.closeProject
```

Choose stable semantic identifiers because command IDs are referenced by manifests, menus, context keys, tests, and potentially keybindings.

### 18.3 Keep Command Handlers Thin

A command handler should normally:

1. gather user input if required;
2. invoke the appropriate application/service operation;
3. handle the user-facing outcome.

Do not implement protocol framing, domain validation, state machines, or substantial feature logic inside command handlers.

### 18.4 Commands Must Delegate to State Owners

Commands request operations from the component that owns the affected state.

For example:

```text
Open Project command
    ↓
project lifecycle coordinator
    ↓
authoring service
    ↓
ProjectState transition
```

Do not mutate project state directly from the command callback.

### 18.5 Do Not Use Commands as an Internal Message Bus

Do not use:

```typescript
vscode.commands.executeCommand(...)
```

as the normal way for JScene3D TypeScript components to call each other.

Use explicit dependencies and method calls for internal collaboration.

Execute a command when invoking the command itself is the intended VS Code behavior.

### 18.6 Command Enablement Must Reflect Real State

Enable or disable commands according to authoritative TypeScript application state.

For example:

```text
Open Project
    available when no conflicting project lifecycle operation is active

Close Project
    available when a JScene3D project is open and not already closing
```

Do not rely solely on command handlers to reject obviously invalid actions after the user invokes them.

### 18.7 Context Keys Drive Declarative Presentation

Use context keys for declarative contribution behavior such as:

- command enablement;
- menu visibility;
- toolbar visibility;
- view actions.

Context keys mirror relevant application state for VS Code presentation.

They are not the source of truth.

### 18.8 Keep Context Keys Minimal

Do not create a context key for every internal state field.

Add one when VS Code contribution configuration genuinely needs to query that state.

Prefer a small set of semantic keys such as:

```text
jscene3d.projectOpen
jscene3d.projectBusy
jscene3d.playing
jscene3d.paused
```

when those states actually exist.

### 18.9 Context Keys Must Describe State

Prefer:

```text
jscene3d.projectOpen
```

over:

```text
jscene3d.showCloseProjectButton
```

The contribution configuration decides what UI should be visible for a given state.

Do not encode one particular presentation decision into the state key.

### 18.10 Update Context Keys from the State Owner

When project or runtime state changes, update the relevant context keys from the coordinated application state.

Do not let individual views independently set conflicting values for the same context key.

### 18.11 Do Not Read Context Keys as Authoritative State

Application logic must not ask a context key whether a project is open and use that answer as domain/application truth.

Read the actual `ProjectState`.

Context keys exist for VS Code contribution evaluation.

### 18.12 Initialize Context Keys Explicitly

Set relevant JScene3D context keys to coherent values during activation.

Do not depend on undefined keys accidentally evaluating in the desired way.

### 18.13 Reset Context Keys on Lifecycle Changes

When project state, service state, or runtime state is invalidated, update corresponding context keys as part of the same coordinated transition.

Do not leave commands enabled for a project or runtime session that no longer exists.

### 18.14 Avoid Context-Key Proliferation for Temporary UI State

Do not add context keys for short-lived implementation details unless the VS Code contribution system genuinely needs them.

For example, an internal protocol request being pending does not automatically require its own context key.

### 18.15 Commands Must Respect Concurrent Operations

Command handlers must not initiate operations that conflict with an operation already in progress.

The owning state/service layer defines the concurrency policy.

Context-key enablement may prevent most invalid invocations, but the underlying operation must still enforce its invariants.

### 18.16 Commands Must Handle User Cancellation

Commands involving user input such as file selection must treat cancellation as a normal outcome.

For example:

```text
Open Project
    ↓
file picker
    ↓
user cancels
    ↓
no project operation
    ↓
no error notification
```

Do not convert cancellation into failure.

### 18.17 Commands Must Not Duplicate Java Validation

An Open Project command may validate that the user selected an appropriate resource for the workflow.

It must not independently validate the JScene3D project contents.

Java remains authoritative for project validity.

### 18.18 Commands Must Not Own Protocol Details

Feature command handlers should call typed authoring operations.

Do not write code such as:

```typescript
jsonRpcClient.request('project/open', rawPayload);
```

directly in a command handler.

The authoring-service client owns protocol method names and DTO mapping.

### 18.19 Command Errors Must Reach the Correct Presentation

When a command-triggered operation fails:

- structured Java diagnostics go to Problems;
- operational information goes to JScene3D Output;
- an explicit user-action failure may produce a concise notification.

Do not make each command invent its own error-presentation policy.

### 18.20 Do Not Create Duplicate Commands for Different UI Placements

One semantic operation should normally have one command ID.

The same command may appear in:

- a view toolbar;
- a context menu;
- the Command Palette;
- a future keybinding.

Do not create separate commands merely because the action appears in several locations.

### 18.21 Keep Command Titles User-Facing

Command titles should describe the action in terminology meaningful to JScene3D users.

Do not expose implementation terminology such as:

```text
Send project/open RPC
Initialize AuthoringService
Refresh ProjectState
```

when the user action is simply:

```text
Open Project
```

### 18.22 Command IDs Are Internal Contracts

Avoid renaming established command IDs casually.

A rename may affect:

- `package.json`;
- menus;
- view actions;
- tests;
- keybindings;
- documentation.

Rename when the semantic command genuinely changes, not merely for stylistic preference.

### 18.23 Do Not Register Commands Per Project

Register commands once during extension activation.

Project lifecycle should alter command enablement and behavior through state/context.

Do not repeatedly register and unregister the same command as projects open and close.

### 18.24 Undo and Redo Must Use Java Authority

When authoring undo/redo UI is implemented, commands invoke Java-authoritative session operations.

Do not use VS Code command state as the undo/redo history for JScene3D authored resources.

TypeScript may display Java-provided availability and operation labels.

### 18.25 Save and Revert Must Use Java Authority

JScene3D authored-resource save and revert commands must invoke the Java authoring backend.

Do not independently serialize or rewrite JScene3D domain files from TypeScript.

This does not prohibit VS Code from continuing to own ordinary text-document save behavior for text editors.

### 18.26 Play Commands Must Remain Separate from Authoring Commands

Future:

```text
Play
Pause
Resume
Stop
```

operate on runtime lifecycle, not authoring-session lifecycle.

Do not overload project-open/close or authoring commands to manage runtime execution.

The UI may coordinate the two lifecycles, but their state and authority remain distinct.

### 18.27 Context Keys Must Preserve Lifecycle Distinctions

Do not collapse distinct states into one broad key when VS Code presentation needs to distinguish them.

For example:

```text
project open
runtime playing
runtime paused
```

are different concepts.

Avoid a generic key such as:

```text
jscene3d.active
```

if it cannot express the required contribution behavior clearly.

### 18.28 Test Command Behavior Through Owners

Most command behavior should be testable by injecting or controlling the operation owner rather than requiring UI automation.

Verify:

- correct operation invoked;
- cancellation produces no operation;
- invalid state prevents conflicting behavior;
- failure reaches the intended presentation path;
- context keys reflect resulting state.

Use actual VS Code integration tests where contribution registration or context behavior itself needs verification.

### 18.29 Manual Tests Must Name the Command

Manual test instructions must identify the exact user action to execute.

For example:

```text
1. Open the Command Palette.
2. Run `JScene3D: Open Project`.
3. Select `small-authoring-project.j3d`.
```

If the command is also available through a toolbar button, instructions may mention that as an alternative.

Do not provide vague instructions such as:

```text
Open the project.
```

when the purpose is to verify a particular command integration.

## 19. Views and Presentation

### 19.1 TypeScript Owns Editor Presentation

The Code OSS TypeScript extension owns the presentation of JScene3D authoring data.

This includes:

- Project view;
- Hierarchy view;
- Inspector view;
- tree items;
- icons;
- labels and descriptions;
- context menus;
- view actions;
- selection;
- expansion state;
- reveal behavior;
- formatting.

Java provides authoritative authoring data and operations, not editor presentation objects.

### 19.2 Use Native VS Code View APIs

Use standard VS Code extension APIs for views whenever they satisfy the requirement.

Prefer:

- `TreeDataProvider` for appropriate hierarchical views;
- native view containers;
- native commands;
- native context menus;
- native icons and theme integration;
- native selection events.

Do not build custom view infrastructure merely to make JScene3D views look unique.

### 19.3 Keep Presentation Separate from Authoring Models

Do not add VS Code presentation fields to protocol or authoring models.

For example, hierarchy protocol data should not contain:

```text
ThemeIcon
TreeItemCollapsibleState
contextValue chosen for VS Code menus
tooltip MarkdownString
command objects
```

The TypeScript presentation layer derives these from semantic authoring data.

### 19.4 Views Consume State

Views should render state owned by an appropriate state/service component.

They must not become authoritative owners of:

- active project state;
- project generation;
- authoring revision;
- Java process state;
- hierarchy domain state;
- Inspector domain state.

A view-specific cache is acceptable only when it exists for presentation and has a clear invalidation policy.

### 19.5 Views Must Not Parse JScene3D Files

Project, Hierarchy, and Inspector views must not parse `.j3d`, world, asset, descriptor, or other JScene3D domain files to reconstruct information available from Java.

Java remains authoritative for JScene3D domain interpretation.

### 19.6 Views Must Not Perform Domain Validation

A view may validate ordinary UI input where appropriate.

It must not independently determine whether:

- a project is semantically valid;
- a component property satisfies its descriptor;
- an entity reference is valid;
- a world definition is legal.

Those decisions belong to Java authority.

### 19.7 Project View Represents Authoring Project Information

The Project view should present information about the active JScene3D authoring project.

As capabilities grow, this may include:

- project summary;
- authored assets;
- project resources;
- project-specific authoring actions.

Do not make the Project view a replacement for the ordinary VS Code Explorer.

The Explorer represents the filesystem/workspace.

The Project view represents JScene3D project semantics.

### 19.8 Explorer and Project View Have Different Responsibilities

When a JScene3D project opens successfully:

```text
Explorer
    shows the project filesystem through the Code OSS workspace

Project
    shows JScene3D project/domain information
```

Do not duplicate the entire filesystem tree in the JScene3D Project view.

Likewise, do not force users to use the filesystem Explorer to understand JScene3D semantic structure.

### 19.9 Hierarchy Is the Primary Scene/World Structure View

The Hierarchy view should present the authored semantic structure supplied by Java.

Java owns concepts such as:

- worlds;
- local entities;
- placements;
- generated occurrences;
- authored ordering;
- enabled state;
- modified state;
- occurrence-safe identity;
- mutation targets.

TypeScript owns their tree presentation.

### 19.10 Hierarchy Identity Must Come from Java

Do not identify hierarchy nodes using:

- tree row position;
- displayed label;
- TypeScript object identity;
- locally generated random IDs;
- array index.

Use the occurrence-safe semantic identity supplied by the Java authoring backend.

This is especially important when the same reusable definition appears under multiple placements.

### 19.11 Hierarchy Selection Is TypeScript UI State

The current selected hierarchy row belongs to Code OSS.

Selecting a hierarchy item may cause TypeScript to request or display Java-authoritative information for the corresponding semantic target.

Do not mirror ordinary tree focus into Java as global editor selection state.

### 19.12 Hierarchy Presentation Must Not Become Domain Authority

Changing:

- expansion;
- sorting presentation;
- focus;
- reveal;
- icon;
- decoration;

must not alter the authored JScene3D model unless the user explicitly invokes an authoring operation.

Presentation changes and domain mutations are separate concepts.

### 19.13 Preserve Authoritative Ordering

Where Java supplies authored child order, display that order unless the feature explicitly defines an alternative presentation.

Do not silently alphabetize semantic hierarchy data if doing so hides authored ordering.

If a future optional sort mode is introduced, it remains presentation state and must not rewrite authored order.

### 19.14 Inspector Displays Java-Authoritative Projection

The Inspector should render the typed target-scoped projection supplied by Java.

This may include:

- sections;
- properties;
- labels;
- descriptions;
- typed values;
- value kinds;
- authored/default/unset origin;
- required state;
- constraints;
- editability;
- mutation capability.

Do not reconstruct descriptor semantics independently in TypeScript.

### 19.15 TypeScript Chooses Inspector Controls

Java describes the semantic type and constraints.

TypeScript decides how to present them using appropriate Code OSS UI.

For example, TypeScript may choose presentation suitable for:

- Boolean values;
- numbers;
- strings;
- vectors;
- references;
- enumerated choices.

The choice of control is presentation logic.

Whether a value is valid remains Java-authoritative.

### 19.16 Do Not Flatten Typed Inspector Values Prematurely

Preserve typed protocol/application values until the presentation boundary.

Do not convert every Inspector value into a display string and then attempt to reconstruct its type when the user edits it.

Formatting for display and typed mutation data are separate concerns.

### 19.17 Inspector Edits Are Explicit Operations

Do not attach executable mutation callbacks to Inspector data models.

Conceptually:

```text
Inspector presentation
    ↓
user changes value
    ↓
explicit typed mutation request
    ↓
Java validation and mutation
    ↓
new authoritative revision/state
    ↓
updated Inspector projection
```

The UI initiates the operation; it does not own the mutation semantics.

### 19.18 Do Not Optimistically Invent Authoritative Inspector State

After sending a mutation, do not assume Java accepted it and permanently update the authoritative local model before confirmation.

Temporary control-level editing state is acceptable where needed for normal UI interaction.

The durable Inspector state must reflect Java-authoritative results.

### 19.19 Read-Only State Must Be Explicit

If Java indicates that a target or property is read-only, generated, unavailable, or otherwise non-editable, the TypeScript presentation should reflect that state.

Do not infer editability solely from the property type.

Do not expose an enabled editor control and wait for Java to reject every impossible edit.

### 19.20 Views Should Refresh from State Changes

Views should respond to relevant state-owner events.

Do not scatter imperative calls such as:

```text
refreshProjectView()
refreshHierarchy()
refreshInspector()
```

through protocol and command code when those views can observe coherent state transitions.

An explicit refresh operation is acceptable when the feature genuinely requires re-querying authoritative data.

### 19.21 Avoid Full Refresh When Targeted Refresh Is Meaningful

For small initial views, a full tree refresh may be sufficient.

As views become larger or more dynamic, use targeted refresh when:

- the authoritative change identifies the affected target;
- VS Code APIs support it cleanly;
- the added complexity provides measurable value.

Do not prematurely build an elaborate incremental update engine.

### 19.22 Empty States Should Be Intentional

Views must handle normal empty states cleanly.

Examples include:

```text
no JScene3D project open
project opening
no hierarchy available
no Inspector target selected
selected target has no editable properties
service unavailable
```

Do not represent ordinary empty states as exceptions.

### 19.23 Failed States Should Not Display Stale Data

If the active project session becomes invalid because the Java service terminates or the project closes, project-dependent views must stop presenting stale information as current.

Clear or transition the view according to the owning application state.

### 19.24 Use Icons as Presentation Only

Icons belong to the TypeScript/VS Code presentation layer.

Do not add icon identities to Java authoring contracts solely for editor presentation.

TypeScript may select icons based on semantic node/property kinds.

Use native theme-aware icon mechanisms where appropriate.

### 19.25 Labels Are Not Identity

Never use a displayed label as the identifier for:

- hierarchy nodes;
- assets;
- Inspector targets;
- mutation targets.

Labels may change and may not be unique.

Use semantic identities supplied by Java.

### 19.26 Keep Context Values Presentation-Specific

VS Code tree `contextValue` strings exist to control presentation such as context-menu contributions.

Derive them from semantic state in the presentation layer.

Do not add `contextValue` to protocol DTOs.

### 19.27 Tooltips Should Add Useful Information

Do not create tooltips that simply repeat the visible label.

Use them when they provide genuinely useful context such as:

- source;
- semantic type;
- diagnostic information;
- full path where appropriate.

Do not place essential information exclusively in a tooltip.

### 19.28 Avoid Custom Webviews Without Need

Do not use a webview merely because it offers unrestricted HTML/CSS.

Prefer native VS Code views and controls when they satisfy the feature.

A custom Inspector implementation may eventually justify richer UI, but that decision should be based on actual requirements rather than visual preference.

### 19.29 Presentation Should Follow VS Code Conventions

Prefer behavior users already understand from VS Code.

Examples include:

- native tree interaction;
- context menus;
- command palette actions;
- Problems diagnostics;
- theme-aware icons;
- normal focus behavior.

JScene3D should feel integrated with the editor rather than like a separate application embedded inside it.

### 19.30 Visual Polish Is Secondary to Correct State

During early vertical slices, prioritize:

- correct authoritative data;
- correct lifecycle;
- correct selection identity;
- correct diagnostics;
- correct operations.

Do not block architectural progress on visual refinement.

Likewise, do not allow temporary visual shortcuts to become permanent architectural coupling.

### 19.31 Avoid Temporary UI That Creates Throwaway Architecture

A simple native representation is preferable to building a custom temporary UI solely to demonstrate a feature.

For example, displaying project summary fields in the existing Project tree is preferable to creating a temporary project dashboard that will immediately be removed.

### 19.32 Reveal Behavior Must Be Intentional

When opening a JScene3D project, the editor may eventually reveal or focus the Hierarchy view because it is the primary semantic authoring view.

Do not force view focus after every background refresh or state change.

Automatic reveal should correspond to an explicit workflow transition.

### 19.33 Views Must Remain Usable with Diagnostics

A project may successfully open while containing warnings or recoverable diagnostics.

Do not assume:

```text
diagnostics present
    ⇒
all project views unavailable
```

Follow Java's operation outcome and capability state.

Fatal project-open failure and successfully opened project with diagnostics are different states.

### 19.34 Presentation Mapping Must Be Testable

Keep transformations from authoring state to VS Code presentation small enough to test independently where useful.

Examples include:

```text
ProjectSummary → project tree rows
HierarchyNode → TreeItem
ProjectDiagnostic → vscode.Diagnostic
InspectorProperty → presentation model
```

Do not require end-to-end UI automation to verify every mapping rule.

### 19.35 Manual Tests Must Verify Visible Behavior

Every new or changed view capability must include manual test instructions describing exactly what the developer should see.

For example, a future Hierarchy test should specify:

```text
1. Launch the POC.
2. Open the named `.j3d` fixture.
3. Open the JScene3D Hierarchy view.
4. Verify the expected world and entity structure.
5. Select the specified entity.
6. Verify the Inspector changes to the expected target.
7. Verify repeated placements appear as distinct hierarchy occurrences.
```

Do not report presentation work complete based only on TypeScript unit tests.

## 20. Java Authoring Service Integration

### 20.1 Java Is the Authoring Authority

The Java authoring service is authoritative for JScene3D authoring behavior.

TypeScript must not duplicate Java logic for:

- project loading;
- project validation;
- descriptor interpretation;
- schema semantics;
- definition resolution;
- hierarchy projection;
- Inspector projection;
- mutation validation;
- authored revisions;
- dirty state;
- save and revert;
- undo and redo.

TypeScript requests capabilities and presents the resulting authoritative state.

### 20.2 Keep the Process Boundary Explicit

Treat the Java authoring service as a separate process with an explicit protocol boundary.

Do not design TypeScript code as though Java objects are locally available.

Communication must occur through defined protocol operations and DTOs.

This remains true even when both repositories are developed together.

### 20.3 One Persistent Authoring Service Process

The initial architecture uses one persistent Java authoring-service process for the relevant extension lifetime.

Conceptually:

```text
extension
    ↓
authoring service process
    ↓
zero or one active project session
```

Closing a project leaves the service available for another project.

Do not spawn a new Java process for every authoring request.

### 20.4 Process Supervision Belongs to the Authoring Service Layer

The TypeScript authoring-service integration owns:

- Java process startup;
- protocol initialization;
- process state;
- stderr handling;
- unexpected process termination;
- orderly shutdown;
- transport ownership.

Views and feature code must not interact with the child process directly.

### 20.5 Keep Process Launch Separate from Protocol Behavior

How Java is located and launched is a different concern from how the authoring protocol works.

Keep launch configuration behind a narrow boundary.

This allows development launch configuration to be replaced later by production packaging and discovery without rewriting:

- protocol code;
- project state;
- views;
- commands.

### 20.6 Do Not Hard-Code Development Paths

Permanent TypeScript source must not contain developer-specific paths such as:

```text
/Users/name/development/...
```

Development Java locations may be supplied through isolated configuration or environment mechanisms.

Production packaging and discovery must be able to replace those mechanisms later.

### 20.7 Do Not Launch Through a Shell Without Need

Prefer direct child-process execution with explicit arguments.

Conceptually:

```text
java
    --module-path ...
    --module ...
```

Do not construct shell command strings when direct process execution is sufficient.

This avoids quoting, escaping, portability, and injection problems.

### 20.8 Java `stdout` Is Reserved for Protocol Traffic

Treat Java stdout exclusively as framed protocol data.

Do not:

- display arbitrary stdout as logging;
- split it into lines;
- search it for status messages;
- allow Java logging to stdout without treating it as protocol corruption.

The transport owns stdout parsing.

### 20.9 Java `stderr` Is Operational Logging

Java stderr may be routed to JScene3D Output.

Do not parse stderr to determine application state.

Protocol responses and process lifecycle determine application behavior.

### 20.10 Initialize Before Feature Operations

After starting Java:

```text
spawn
    ↓
establish transport
    ↓
initialize
    ↓
validate compatibility
    ↓
ready
```

Do not send project or authoring operations before initialization succeeds.

### 20.11 Validate Process Kind and Capabilities

Initialization must verify the actual protocol contract, including where applicable:

- protocol version;
- process kind;
- advertised capabilities.

Do not assume that successfully spawning Java means the expected authoring service is running.

### 20.12 Protocol Compatibility Must Be Explicit

Follow the version compatibility rules defined by the integration standards.

Do not silently continue after incompatible protocol initialization.

An incompatible service must fail clearly before feature operations begin.

### 20.13 Advertised Capabilities Are Authoritative

Do not invoke a protocol capability that the service did not advertise where the protocol requires capability negotiation.

Likewise, do not infer support merely because TypeScript contains a DTO or method implementation for it.

### 20.14 Keep the Service Client Typed

Feature code should interact with typed authoring operations such as:

```typescript
await authoringService.openProject(...);
await authoringService.closeProject(...);
```

It should not send raw JSON-RPC method names and payloads.

Raw dispatch belongs inside the protocol layer.

### 20.15 Keep Java Domain Objects Out of TypeScript

Do not attempt to mirror or serialize complete Java objects such as:

```text
EditorProjectSession
GameProject
SceneDefinition
DefinitionResolver
working-copy implementations
descriptor registries
```

The Java service exposes purpose-built wire contracts.

TypeScript receives only what the client needs.

### 20.16 Keep Protocol DTOs Out of Java Domain Logic

The TypeScript architecture should preserve the corresponding Java rule: wire DTOs are transport contracts, not domain models.

Do not design TypeScript behavior that requires Java domain classes to become serialization-shaped merely for client convenience.

### 20.17 Project Open Is Java-Authoritative

TypeScript may allow the user to select a descriptor or project path.

Java determines:

- descriptor discovery;
- descriptor validity;
- canonical project root;
- project identity;
- project metadata;
- diagnostics;
- resulting project-session generation.

Do not independently reproduce these decisions in TypeScript.

### 20.18 Use the Canonical Java Project Root

When project open succeeds, use the canonical root returned by Java for subsequent workspace coordination.

Do not assume the selected descriptor's parent directory is necessarily the authoritative project root.

### 20.19 Preserve Project Session Generation

Store the generation returned by Java with the active TypeScript project state.

Do not manufacture a substitute generation.

Any future project-scoped request requiring generation must use Java's value.

### 20.20 Preserve Authoring Revision

When Java exposes authoring revision, treat it separately from project-session generation.

Use revision for operations whose validity depends on a specific authored state.

Do not increment revisions locally.

### 20.21 Java Owns Mutation Validation

For future mutations, TypeScript sends:

```text
semantic target
expected revision
typed replacement/action
```

Java decides whether the operation is valid.

Do not reproduce descriptor acceptance rules in TypeScript as authoritative validation.

TypeScript may provide UI-level hints, but Java has the final decision.

### 20.22 Java Owns Dirty State

Do not infer authoritative dirty state by comparing TypeScript snapshots.

Use Java-provided authoring state and change notifications.

VS Code presentation may display dirty state, but it does not define it.

### 20.23 Java Owns Save, Revert, Undo and Redo

These operations act on Java-authoritative authored state.

TypeScript commands invoke the corresponding authoring capabilities and present the result.

Do not maintain a second TypeScript undo history for JScene3D domain mutations.

### 20.24 Java Owns Hierarchy Semantics

The Java backend determines:

- hierarchy structure;
- authored ordering;
- definition expansion;
- generated occurrences;
- occurrence identity;
- editability;
- provenance;
- hierarchy diagnostics.

TypeScript maps the resulting data into VS Code tree presentation.

### 20.25 Java Owns Inspector Semantics

The Java backend determines:

- target identity;
- sections and properties;
- typed values;
- origins;
- constraints;
- descriptor semantics;
- editability;
- mutation targets.

TypeScript chooses presentation controls and formatting.

### 20.26 Do Not Mirror UI Selection into Java

Current VS Code selection is presentation state.

Send a semantic target to Java only when requesting an operation such as:

```text
Inspector projection
mutation
hierarchy action
```

Do not maintain a Java-side global editor selection merely to mirror Code OSS focus.

### 20.27 Service Failure Invalidates Its Project Session

If the Java authoring process terminates unexpectedly, the Java project session no longer exists.

TypeScript must invalidate state dependent on that service instance.

Do not continue displaying cached project state as though it remains authoritative.

### 20.28 Do Not Automatically Reconstruct Lost Authority

After service failure, do not silently recreate:

- project generation;
- revision;
- dirty state;
- undo history;
- working-copy state.

A future recovery workflow may start a new service and reopen the project, producing a new authoritative session.

Until such a workflow exists, represent the failure honestly.

### 20.29 Keep Restart Policy Separate from Process Supervision

Process supervision detects and cleans up failure.

Automatic recovery is a separate feature.

Do not turn basic supervision into an implicit crash-restart loop.

### 20.30 Protocol Errors Must Not Corrupt Project State

A failed request must leave TypeScript state consistent with what is actually known.

Do not partially apply a response before it has:

- been completely framed;
- parsed;
- validated;
- correlated with the request;
- passed any required generation/revision checks.

### 20.31 Do Not Infer Success from Process Survival

A Java process remaining alive does not mean a requested operation succeeded.

Use the structured protocol response.

Likewise, a project validation failure does not necessarily mean the service itself failed.

### 20.32 Keep Domain Failure Separate from Service Failure

Conceptually:

```text
invalid project
    → service remains healthy
    → project not opened
    → diagnostics returned

service process crashes
    → service unavailable
    → project session invalid
```

Do not collapse these into one generic unavailable state.

### 20.33 Close Project Without Stopping the Service

The normal project-close workflow is:

```text
project/close
    ↓
Java releases project session
    ↓
TypeScript clears project-scoped state
    ↓
service remains ready
```

Do not terminate Java merely because the project closed.

### 20.34 Extension Shutdown Owns Service Shutdown

Normal extension disposal should request orderly Java service shutdown.

If the service does not exit according to the defined policy, the owning process layer may perform necessary cleanup.

Do not leave orphan Java processes.

### 20.35 Runtime/Play Is a Separate Process Boundary

The persistent authoring service must not gradually become the game runtime process.

Future Play uses the separately defined runtime architecture.

Conceptually:

```text
persistent authoring service
    safe authored state

fresh Play/runtime process
    executable game/runtime/LWJGL state
```

Do not introduce runtime execution into the authoring service for convenience.

### 20.36 Live Runtime State Is Not Authoring State

Future runtime objects may:

- spawn;
- disappear;
- move;
- change component values;
- diverge from authored state.

Do not overwrite authored project state merely because runtime inspection reports different live values.

Authoring and runtime identities/state require explicit mapping.

### 20.37 Keep Runtime Protocol Separate

Do not add Play/runtime operations to the authoring protocol merely because a protocol implementation already exists.

Runtime lifecycle and inspection have different:

- process ownership;
- failure semantics;
- state;
- capabilities;
- performance requirements.

Reuse protocol infrastructure where appropriate, not the same service authority.

### 20.38 Cross-Language Contracts Require Automated Protection

Every protocol capability must have automated protection against Java/TypeScript contract drift.

Use the agreed contract strategy, such as canonical fixtures or equivalent validation.

Do not rely on manually keeping Java records and TypeScript interfaces synchronized.

### 20.39 Protocol Changes Require Both-Side Review

A protocol change is a cross-repository API change.

When adding or modifying a protocol capability, review:

- Java DTO;
- TypeScript DTO;
- runtime validation;
- compatibility implications;
- tests;
- fixtures;
- capability negotiation where relevant.

Do not change one side and leave the other to be fixed later without explicitly marking the branch/work as incomplete.

### 20.40 Manual Testing Must Exercise the Real Java Service

For features crossing the authoring boundary, manual testing must use the real Java authoring service, not only a fake protocol client.

Instructions must identify:

- how to build/locate the development Java service;
- required environment/configuration;
- how to launch the correct Code OSS POC;
- exact JScene3D command to run;
- fixture/project to use;
- expected Project/Hierarchy/Inspector state;
- expected Problems and Output behavior;
- expected Java process lifecycle.

Automated fake-client tests remain valuable, but they do not replace an end-to-end manual check of the actual process boundary.

## 21. Protocol and Wire DTOs

### 21.1 The Protocol Is a Versioned Contract

The Java ↔ TypeScript protocol is an explicit cross-process API.

Treat changes to:

- method names;
- notification names;
- request parameters;
- response results;
- error structures;
- DTO fields;
- field semantics;
- capability names;
- version negotiation;

as contract changes.

Do not treat protocol structures as internal implementation details.

### 21.2 Use Explicit Wire DTOs

Define explicit TypeScript DTOs for protocol data.

For example:

```typescript
interface ProjectSummaryDto {
 // exact wire fields
}
```

Do not use:

```typescript
Record<string, unknown>
```

or generic JSON objects once the protocol shape is known.

### 21.3 DTOs Represent the Wire Contract Only

A DTO describes serialized data crossing the process boundary.

It must not contain:

- methods;
- callbacks;
- VS Code objects;
- `Uri` instances;
- `TreeItem` instances;
- event emitters;
- process handles;
- application services.

DTOs are data.

### 21.4 Do Not Mirror Complete Java Objects

Do not create DTOs by mechanically reproducing every field of a Java domain object.

Design protocol contracts around capabilities and client requirements.

For example:

```text
EditorProjectSession
```

does not imply:

```text
EditorProjectSessionDto
```

The protocol should expose the project/session information and operations the client actually requires.

### 21.5 Keep DTOs Separate from Java Domain Models

The Java implementation maps domain state to wire DTOs.

TypeScript validates and consumes those DTOs.

Neither side should require its domain/application model to have the same shape as the wire representation.

Conceptually:

```text
Java domain
    ↓ mapping
wire DTO
    ↓ validation
TypeScript application state
```

### 21.6 Match Java Wire Semantics Exactly

TypeScript DTO definitions must match the authoritative Java protocol contract.

Preserve:

- field names;
- required versus optional fields;
- `null` semantics;
- primitive types;
- collection shapes;
- enum/string values;
- nested structures.

Do not rename or reinterpret wire fields merely to make TypeScript code look more idiomatic.

Transform after validation if a different application representation is genuinely useful.

### 21.7 External Protocol Data Starts as `unknown`

Parsed protocol JSON must be treated as untrusted runtime data.

Do not write:

```typescript
const response = JSON.parse(payload) as ProjectOpenResultDto;
```

Instead:

```text
parse JSON
    ↓
unknown
    ↓
validate envelope
    ↓
validate method-specific DTO
    ↓
strongly typed value
```

### 21.8 Validate Every Response Shape

A successful JSON-RPC response is not sufficient evidence that its result matches the expected contract.

Validate the result for the request being completed.

Reject malformed results as protocol failures.

Do not substitute defaults for missing required fields.

### 21.9 Validate Notifications

Future server notifications must be validated before they affect TypeScript state.

Do not trust a notification merely because its method name is recognized.

Validate:

- envelope;
- method;
- parameters;
- method-specific DTO.

### 21.10 Validate Error Responses

Protocol errors are wire data too.

Validate the expected error structure before exposing it to higher layers.

Do not assume any object containing `error` is a valid JSON-RPC error response.

### 21.11 Keep Envelope Validation Separate from DTO Validation

JSON-RPC infrastructure should validate generic protocol structure.

Feature/protocol-contract code should validate method-specific payloads.

Conceptually:

```text
JSON-RPC client
    validates response envelope and request ID

Authoring protocol
    validates ProjectOpenResultDto
```

Do not make the generic JSON-RPC client understand JScene3D project fields.

### 21.12 Keep Method Names Centralized

Protocol method names should have one clear owner.

Do not scatter raw strings such as:

```text
project/open
project/close
service/shutdown
```

through commands, views, and state code.

The typed authoring protocol/client owns those method identifiers.

### 21.13 Feature Code Must Not Send Raw Requests

Outside the protocol/service layer, use typed operations.

Prefer:

```typescript
await authoringService.openProject(path);
```

over:

```typescript
await rpc.request('project/open', {
 path
});
```

This prevents protocol details from leaking into feature code.

### 21.14 Keep Request and Response DTOs Narrow

A protocol operation should transfer only the information required for that capability.

Do not create one large request or response object reused by unrelated operations merely to reduce the number of DTO declarations.

Narrow contracts are easier to:

- validate;
- version;
- test;
- understand.

### 21.15 Use Semantic Protocol Operations

Protocol operations should represent JScene3D capabilities.

Prefer:

```text
project/open
project/close
hierarchy/get
inspector/get
authoring/mutate
```

or the agreed equivalent naming scheme.

Avoid generic remote-object operations such as:

```text
getObject
setProperty
invokeMethod
execute
```

that expose implementation structure rather than stable capabilities.

### 21.16 Do Not Expose Java Class Names as Protocol Architecture

Protocol concepts should be named for stable domain/capability meaning.

Do not design the protocol around:

```text
call EditorProjectSession method
instantiate Java class
fetch Java object
```

The protocol is not Java remote method invocation.

### 21.17 Do Not Put VS Code Concepts in the Protocol

Wire DTOs must not contain VS Code-specific concepts such as:

```text
TreeItem
ThemeIcon
contextValue
ViewColumn
Command
DiagnosticCollection
workspace folder object
```

The TypeScript presentation layer maps semantic data into those APIs.

### 21.18 Preserve Typed Values

Where the Java protocol represents typed JScene3D values, preserve that typing in the wire contract.

Do not flatten all values to strings merely because JSON supports strings conveniently.

Inspector and mutation protocols in particular must preserve enough information to distinguish supported value kinds.

### 21.19 Preserve Semantic Identity

Wire contracts must use stable semantic identities supplied or recognized by Java.

Examples include:

- project/session generation;
- authoring revision;
- asset identity;
- hierarchy occurrence identity;
- Inspector target;
- component/property identity;
- mutation target.

Do not substitute labels, row numbers, or TypeScript object identity.

### 21.20 Generation and Revision Must Remain Distinct

Do not combine:

```text
project-session generation
```

and:

```text
authoring revision
```

into one generic protocol `version`.

They protect different kinds of state.

DTO names and fields should preserve that distinction.

### 21.21 Mutation DTOs Must Carry Expected Authority

Future authoring mutations should carry the authoritative context required by Java to reject stale or invalid operations.

Conceptually:

```text
project/session generation
expected authoring revision
semantic mutation target
typed replacement/action
```

The exact contract must follow the Java authoring API and protocol design.

Do not rely on current UI selection as mutation identity.

### 21.22 Do Not Send Executable Callbacks

A protocol DTO can never contain behavior such as:

```typescript
edit: (value: ProjectValue) => void;
```

Represent the capability through data:

```text
editable
mutation target
accepted value semantics
```

and invoke a separate protocol operation when the user performs the mutation.

### 21.23 Keep Protocol Errors Machine-Readable

Errors that callers need to distinguish must include stable structured information.

Do not require TypeScript to parse Java exception text.

Human-readable messages complement structured error identity; they do not replace it.

### 21.24 Domain Diagnostics Are Structured Data

Project and authoring diagnostics should cross the protocol as explicit DTOs.

Preserve information such as:

- severity;
- stable diagnostic code;
- message;
- source;
- location;
- structured details where part of the contract.

Do not reduce diagnostics to one formatted string.

### 21.25 Do Not Invent Source Coordinates

If Java supplies a semantic or JSON location but not line/column coordinates, the wire contract should represent what Java actually knows.

Do not manufacture text coordinates in TypeScript DTOs.

Presentation may use a documented fallback range for VS Code Problems.

### 21.26 Keep Protocol Versioning Explicit

Initialization must establish protocol compatibility before feature operations.

Follow the versioning rules in the integration development standards.

Do not infer compatibility because both repositories were built on the same machine or branch.

### 21.27 Capabilities Represent Implemented Features

Advertise and consume only protocol capabilities that actually exist.

Do not advertise planned methods merely because DTOs or design documents exist.

TypeScript should not call a capability that initialization says is unavailable.

### 21.28 Add Protocol Capabilities Incrementally

When implementing a new vertical slice, add only the protocol operations required by that slice.

For example, implementing Hierarchy does not require simultaneously defining every future Inspector, mutation, Play, and runtime operation.

Keep the contract reviewable.

### 21.29 Do Not Build a Generic RPC Framework Beyond Need

The low-level JSON-RPC client may provide generic request/response mechanics.

JScene3D protocol code should remain explicit and typed.

Do not create:

- dynamic proxy systems;
- remote-object frameworks;
- reflection-based DTO generation;
- generic command buses;

without a demonstrated requirement.

### 21.30 Keep Framing Independent of JSON-RPC

Content-Length framing is responsible for producing complete payloads.

JSON-RPC is responsible for protocol envelopes.

Authoring protocol code is responsible for JScene3D operations.

Keep these layers separate:

```text
byte stream
    ↓
Content-Length framing
    ↓
JSON payload
    ↓
JSON-RPC
    ↓
JScene3D authoring protocol
```

### 21.31 Content Length Is Measured in Bytes

`Content-Length` represents UTF-8 payload bytes, not JavaScript string length.

Never calculate framing length using character count.

Tests must include non-ASCII payloads.

### 21.32 Framing Must Handle Arbitrary Stream Chunking

The decoder must support:

- partial headers;
- partial payloads;
- multiple frames in one chunk;
- frame boundaries unrelated to process `data` events.

Do not assume one chunk equals one message.

### 21.33 Bound Protocol Input

Honor the agreed framing limits for:

- header size;
- payload size.

Reject input exceeding those limits.

Do not allow unbounded buffering from a malformed or hostile process stream.

### 21.34 Serialize Writes

Concurrent requests must not interleave framed bytes.

The transport owns serialized writing.

Feature code should not coordinate write locks.

### 21.35 Correlate Requests Independently of Response Order

JSON-RPC responses may arrive in a different order from requests.

Use request IDs and the pending-request map.

Do not resolve requests based on FIFO ordering.

### 21.36 Reject Pending Requests on Connection Failure

If the transport or Java process fails, settle every outstanding request with failure.

Do not leave pending promises unresolved.

### 21.37 Unknown Response IDs Are Protocol Problems

A response for an unknown or no-longer-valid request ID must not be silently applied to application state.

Handle according to the defined protocol/client policy and record useful troubleshooting information.

### 21.38 Notifications Have No Request Correlation

Future notifications are server-initiated protocol events.

Do not force them through the request pending-map model.

Validate and route them through explicit notification handlers.

### 21.39 Protocol DTOs Must Not Become Mutable Shared State

After validation, protocol results may be transformed into application state.

Do not retain a mutable raw DTO and allow several components to modify it.

Treat wire values as immutable snapshots.

### 21.40 Protect Against Cross-Language Drift

Maintain automated verification that TypeScript and Java agree on protocol structures.

The permanent strategy should use shared canonical contract artifacts or another mechanism that validates both sides against the same versioned expectations.

Do not rely solely on duplicate handwritten tests that can drift together with their local implementation.

### 21.41 Real-Process Tests Complement Contract Fixtures

Canonical fixtures verify known message shapes.

Real Java subprocess tests verify that the currently built service actually communicates with the TypeScript implementation.

Use both where practical.

Neither completely replaces the other.

### 21.42 Protocol Changes Require Tests at Multiple Layers

A new or changed operation should normally have:

- Java protocol/service tests;
- TypeScript DTO validation tests;
- TypeScript client tests;
- cross-language contract verification;
- a real-process test for important vertical slices.

Do not rely only on UI testing.

### 21.43 Keep Test Fixtures Small

Protocol fixtures should contain the smallest representative data needed to prove the contract.

Do not use large real projects as the only protocol fixtures.

Small fixtures make failures easier to understand.

### 21.44 Do Not Put Development Paths in Fixtures

Canonical protocol fixtures must not depend on one developer's checkout paths.

Use stable representative values or normalized fixture locations according to the test strategy.

### 21.45 Document Temporary Contract Limitations

If an early protocol cannot yet represent something precisely, document the limitation rather than inventing semantics.

Examples include:

- diagnostics without line/column coordinates;
- no automatic crash recovery;
- no project replacement;
- no expected-generation close parameter.

Temporary limitations should be explicit and testable.

### 21.46 Manual Testing Must Verify Protocol Outcomes Through Features

Manual testing should exercise protocol behavior through the actual JScene3D user workflow rather than manually sending JSON-RPC messages.

For example:

```text
Open malformed project
    ↓
Java protocol returns diagnostics
    ↓
Problems shows those diagnostics
    ↓
Output records the failed operation
```

Low-level protocol tests belong in automated tests.

Manual testing verifies that the complete feature correctly uses the protocol.

## 22. Runtime Validation of External Data

### 22.1 Validate Every External Trust Boundary

Data entering JScene3D TypeScript from outside the TypeScript type system must be treated as untrusted until validated.

This includes:

- Java protocol messages;
- parsed JSON;
- extension configuration;
- environment variables;
- persisted extension state;
- filesystem-derived metadata;
- process exit information where assumptions are made about its shape.

Static TypeScript types do not validate runtime data.

### 22.2 Protocol Data Starts as `unknown`

JSON received from the Java service must initially be treated as `unknown`.

The expected flow is:

```text
bytes
    ↓
framing
    ↓
JSON parse
    ↓
unknown
    ↓
JSON-RPC envelope validation
    ↓
method-specific DTO validation
    ↓
typed protocol value
```

Do not assert parsed JSON directly to the expected DTO type.

### 22.3 Validate at the Boundary Once

Perform runtime validation as close as practical to the external boundary.

After a value has been successfully validated, downstream code should normally receive the strongly typed result.

Do not repeat the same structural checks throughout feature and presentation code.

### 22.4 Validation Must Check Required Structure

A validator must verify the fields required by the wire contract.

Depending on the DTO, this may include:

- object shape;
- required fields;
- primitive types;
- integer requirements;
- arrays;
- nested objects;
- allowed literal values;
- optional versus nullable fields.

Do not validate only one identifying field and then cast the rest.

### 22.5 Validate Closed Literal Sets

When the protocol defines a closed set of values, reject unknown values unless the compatibility contract explicitly allows forward-compatible unknown variants.

For example, if process kind must be:

```text
authoring
```

do not silently accept another string.

Compatibility behavior must be deliberate.

### 22.6 Validate Numeric Semantics

JavaScript has one `number` type, but protocol fields may have narrower semantics.

Validate where required that values are:

- finite;
- integers;
- non-negative;
- within an expected safe range.

Request IDs, generations, revisions, counts, and lengths must not accept arbitrary `number` values merely because JSON parsing produced a number.

### 22.7 Respect JavaScript Safe Integer Limits

If a Java protocol field may exceed JavaScript's safe integer range, do not silently represent it as an ordinary `number`.

Define an explicit cross-language representation before using such values.

Do not assume Java `long` and TypeScript `number` are universally interchangeable.

### 22.8 Validate Arrays and Their Elements

Checking:

```typescript
Array.isArray(value)
```

is not sufficient when the element type matters.

Validate each element according to the DTO contract.

A diagnostics array is valid only if each diagnostic is valid.

### 22.9 Validate Nested Objects

Do not assume nested data is valid because the outer DTO passed a shallow check.

Validate nested structures according to their contract.

Keep validators composable where this reduces duplication without creating a generic validation framework.

### 22.10 Reject Missing Required Fields

Do not invent defaults for required protocol fields.

If a required field is missing, the message is incompatible or malformed.

Fail explicitly.

Defaults belong in the authoritative contract or application model, not in ad hoc recovery from invalid wire data.

### 22.11 Preserve Optional and Nullable Semantics

Do not treat:

```text
field absent
field = null
field = empty string
```

as interchangeable unless the protocol explicitly defines them as equivalent.

Runtime validators must preserve the contract's distinction.

### 22.12 Reject Incorrect Extra Structure When It Matters

Unknown fields may be tolerated when the protocol's compatibility policy permits additive evolution.

Do not automatically reject every additional property merely because the TypeScript interface does not currently use it.

Conversely, do not accept unknown discriminants or structural variants when they change the meaning of the value.

Follow the explicit protocol compatibility rules.

### 22.13 Validation Is Not Domain Validation

TypeScript runtime validation verifies that external data has the expected structural contract.

It must not duplicate Java domain rules.

For example, TypeScript may validate:

```text
projectId is a string
generation is an integer
diagnostics is an array of valid DTOs
```

It must not independently decide:

```text
projectId conforms to JScene3D domain rules
startup world exists
component descriptor is valid
asset reference resolves
```

Those remain Java-authoritative.

### 22.14 Configuration Requires Validation

Development or extension configuration that influences process launch must be validated before use.

Examples include:

- Java executable configuration;
- module path configuration;
- future runtime executable configuration.

Fail with an actionable configuration error rather than passing malformed values into process launch.

### 22.15 Environment Variables Are Untrusted Strings

Environment variables are external input.

Do not assume an environment variable:

- exists;
- is non-empty;
- contains a valid path;
- contains a valid number;
- represents a supported option.

Parse and validate according to its intended meaning.

### 22.16 Persisted State Requires Validation

Data restored from extension or workspace persistence may have been written by:

- an older extension version;
- a different project;
- a previous architecture.

Validate persisted values before using them.

Do not assume persisted state matches current TypeScript types merely because this version would write that shape.

### 22.17 Never Persist Process-Local Authority

Do not persist values such as:

- protocol request IDs;
- Java process state;
- pending requests;
- live process handles;
- current Java session generation as reusable authority;
- current authoring revision as reusable authority.

A fresh Java process establishes fresh authoritative state.

### 22.18 Filesystem Existence Is Not Project Validation

TypeScript may check whether a configured executable or required development path exists where necessary to provide an actionable launch error.

Do not interpret filesystem existence as proof that a JScene3D project or descriptor is valid.

Project validation belongs to Java.

### 22.19 Do Not Validate by Executing Untrusted Content

Safe authoring validation must not execute:

- project application code;
- runtime extensions;
- scripts;
- game logic.

Runtime validation means checking data structure, not executing project-controlled behavior.

### 22.20 Keep Validators Focused

Prefer small validators corresponding to explicit DTOs or external configuration structures.

Avoid building a general reflection-based schema framework unless a concrete need emerges.

A validator should be easy to compare against the authoritative wire contract.

### 22.21 Validators Must Not Have Side Effects

Runtime validation should not:

- mutate project state;
- publish diagnostics;
- start processes;
- write Output;
- show notifications;
- alter the value being validated.

Return or throw the validation result according to the protocol-layer convention.

Higher layers decide how failures affect state and presentation.

### 22.22 Validation Errors Need Useful Context

When runtime validation fails, provide enough information to identify the contract problem.

Useful information may include:

- expected DTO/operation;
- missing or invalid field;
- protocol method;
- request ID where relevant.

Do not dump large raw payloads into user-facing messages.

### 22.23 Do Not Leak Raw Payloads into Notifications

Malformed external data is primarily a technical/protocol problem.

Record useful troubleshooting information in JScene3D Output where appropriate.

User notifications should remain concise.

### 22.24 Avoid Validation Through Exceptions from Arbitrary Access

Do not treat code such as:

```typescript
try {
 return value.project.summary.name;
} catch {
 throw new Error('Invalid project response');
}
```

as runtime validation.

Validate structure deliberately before accessing it as the expected type.

### 22.25 Type Guards Must Actually Guard the Full Contract

A function declared as:

```typescript
function isProjectSummaryDto(value: unknown): value is ProjectSummaryDto
```

must validate enough of `ProjectSummaryDto` to justify that narrowing.

Do not write weak type guards that check only:

```typescript
typeof value === 'object'
```

and then promise the compiler a much stronger type.

### 22.26 Assertion Functions Require the Same Rigor

If using a TypeScript assertion function such as:

```typescript
function assertProjectSummaryDto(
 value: unknown
): asserts value is ProjectSummaryDto {
 // ...
}
```

the implementation must establish the asserted contract.

Assertion syntax does not reduce runtime validation requirements.

### 22.27 Prefer Reusable Field Validators Only When They Clarify

Small helpers such as:

```text
requireString
requireInteger
requireArray
```

may reduce repetitive validation code.

Do not build an elaborate generic schema DSL unless it demonstrably improves clarity and maintainability.

The DTO contract should remain easy to read.

### 22.28 Cross-Language Fixtures Must Pass Production Validators

Canonical protocol fixtures must be validated using the same runtime validators used by production code.

Do not maintain separate permissive fixture validators that allow test data production code would reject.

### 22.29 Real Java Responses Must Pass the Same Validators

Real-process integration tests must pass Java responses through the normal framing, JSON-RPC, and DTO-validation path.

Do not bypass validation in integration tests merely because Java is considered trusted.

The purpose is partly to detect contract drift.

### 22.30 Invalid External Data Must Not Partially Update State

Complete validation before applying external data to application state.

Do not:

1. update project name;
2. discover another response field is invalid;
3. leave partially updated project state.

The message is accepted as a coherent contract value or rejected.

### 22.31 Validation Failure Must Settle the Request

If a response is structurally invalid, the corresponding request must fail.

Do not leave the pending request unresolved while merely logging the validation problem.

### 22.32 Tests Must Cover Invalid Data

Validators require negative tests, not only valid fixtures.

Include representative cases such as:

- missing required field;
- wrong primitive type;
- invalid nested value;
- invalid discriminant;
- non-integer generation/revision;
- malformed diagnostics;
- unexpected `null`;
- invalid JSON.

Focus on meaningful contract failures rather than generating every theoretical malformed object.

### 22.33 Manual Testing Is Not a Substitute for Validation Tests

A manually successful project open proves that one real response was accepted.

It does not prove validators correctly reject malformed data.

Runtime validation must be covered primarily through automated tests.

Manual testing verifies the end-to-end user behavior when validation or protocol failure occurs.

## 23. Project and Authoring State

### 23.1 Java Owns Authoritative Authoring State

The Java authoring service is authoritative for JScene3D project and authored state.

This includes:

- active project session;
- project-session generation;
- authoring revision;
- authored definitions;
- hierarchy;
- Inspector projections;
- mutations;
- dirty state;
- save and revert;
- undo and redo;
- project settings.

TypeScript stores only the state required to coordinate Code OSS and present Java-authoritative information.

### 23.2 Keep Project Lifecycle State Explicit

Model the TypeScript project lifecycle explicitly.

Relevant states may include:

```text
closed
opening
open
closing
failed
```

Use only states that correspond to actual behavior.

Do not infer lifecycle from whether individual fields happen to be populated.

### 23.3 Keep Service State Separate from Project State

The Java authoring service may be ready while no project is open.

These are separate state machines:

```text
service state
    stopped
    starting
    ready
    stopping
    failed

project state
    closed
    opening
    open
    closing
    failed
```

Do not combine them into one generic JScene3D state.

### 23.4 Project State Stores Java-Returned Identity

When a project opens successfully, retain the authoritative information returned by Java.

This includes, where provided:

- project summary;
- canonical project root;
- descriptor path;
- project-session generation;
- diagnostics;
- authoring revision.

Do not reconstruct these values independently from TypeScript inputs.

### 23.5 Project State Does Not Own the Java Session

The actual `EditorProjectSession` exists in Java.

TypeScript project state represents the client-side knowledge of that session.

Do not model TypeScript state as though it contains or controls the Java session object directly.

### 23.6 Store Only State TypeScript Needs

Do not cache every field returned by every protocol response automatically.

Retain information when it is required for:

- presentation;
- subsequent protocol operations;
- stale-result protection;
- lifecycle coordination.

Avoid creating a TypeScript mirror of the complete Java authoring model.

### 23.7 Keep Project Summary Separate from Full Authoring State

A project summary describes the opened project.

It is not the complete authored project model.

Do not gradually add hierarchy, Inspector, working-copy, runtime, and view state to `ProjectSummary` merely because they all relate to the same project.

### 23.8 Keep Hierarchy State Separate

When Hierarchy is implemented, its current Java-derived snapshot should have a focused owner.

It should be scoped to:

- the active project generation;
- the relevant authoring revision where applicable.

Do not embed the entire hierarchy into general project lifecycle state unless there is a demonstrated reason.

### 23.9 Keep Inspector State Separate

Inspector state is target-specific and may change frequently as the user changes TypeScript-side selection.

Keep it separate from project summary and hierarchy lifecycle state.

An Inspector state may conceptually include:

```text
no target
loading target
projection available
target unavailable
failed
```

Use only states required by the actual implementation.

### 23.10 Current UI Selection Belongs to TypeScript

The currently selected:

- Project item;
- hierarchy node;
- asset;
- editor resource;

is Code OSS presentation state.

Do not make Java maintain a global editor selection.

When Java authority is required, translate the TypeScript selection into the corresponding semantic authoring target.

### 23.11 Selection Must Carry Semantic Identity

A selected presentation object must retain or provide access to the semantic identity required for subsequent authoring operations.

For example:

```text
Hierarchy TreeItem
    ↓
HierarchyOccurrenceId
    ↓
Inspector request
```

Do not recover semantic identity from:

- displayed labels;
- row numbers;
- tree positions;
- object identity.

### 23.12 Clear Dependent State When Selection Changes

When an Inspector target changes, stale Inspector data for the previous target must not remain presented as though it belongs to the new target.

Transition the Inspector state explicitly while the new authoritative projection is obtained.

### 23.13 Protect Against Stale Inspector Responses

Rapid selection changes may produce:

```text
select A
    ↓
Inspector request A

select B
    ↓
Inspector request B

response B
response A
```

Response A must not replace the current Inspector for B.

Use semantic target identity, operation identity, generation, revision, or an appropriate combination.

### 23.14 Hierarchy State Must Be Generation-Scoped

A hierarchy snapshot from project generation N must never be applied to project generation N+1.

Project close or replacement invalidates all hierarchy state from the previous generation.

### 23.15 Inspector State Must Be Generation-Scoped

An Inspector projection from a closed or replaced Java project session is stale regardless of whether its semantic target appears similar in the new project.

Invalidate it when the owning project generation changes.

### 23.16 Revision-Sensitive State Must Record Revision

Authoring data whose validity depends on a particular authored revision should retain that revision where required.

This is particularly important for:

- Inspector projections;
- mutation requests;
- future targeted hierarchy changes.

Do not assume the current project revision is still the revision under which an earlier projection was produced.

### 23.17 Do Not Optimistically Advance Authoritative Revision

After requesting a mutation, save, undo, or redo, wait for Java's authoritative result.

Do not calculate:

```text
revision + 1
```

in TypeScript and treat that as the new authority.

### 23.18 Dirty State Comes from Java

TypeScript may display dirty state and use it for command enablement.

It must not determine authoritative dirty state by comparing local snapshots.

Use Java-provided state and changes.

### 23.19 Undo and Redo State Comes from Java

TypeScript may retain Java-provided information such as:

- can undo;
- can redo;
- operation labels.

Do not maintain a parallel JScene3D authoring undo stack in TypeScript.

### 23.20 Save State Comes from Java

A successful protocol response or authoritative change determines whether JScene3D authored state is saved.

Do not clear dirty presentation merely because the user invoked Save.

Wait for Java confirmation.

### 23.21 Diagnostics Are Project-Scoped State

Project diagnostics belong to the relevant project/open operation and Java project session.

Opening another project or closing the current project must replace or clear the appropriate diagnostics.

Do not allow diagnostics from an earlier project to remain presented as current.

### 23.22 Failed Open Must Not Create Open State

A failed `project/open` may produce useful diagnostics.

Retain those diagnostics for presentation where appropriate, but do not create:

- an active project summary;
- an active generation;
- hierarchy state;
- Inspector state.

Failure information and opened-project state are separate.

### 23.23 Successfully Opened Projects May Have Diagnostics

Do not assume diagnostics imply project-open failure.

A project may open successfully while producing warnings or other recoverable diagnostics.

Use the Java operation result to determine whether a project session exists.

### 23.24 Workspace State and Project State Must Be Coordinated

Once project roots are integrated with Code OSS workspaces, maintain a clear distinction:

```text
workspace state
    owned by Code OSS

JScene3D project state
    backed by Java authoring service
```

The two should correspond according to the defined lifecycle, but neither should be inferred blindly from the other.

### 23.25 Workspace Changes May Invalidate Project State

If the user changes or closes the workspace such that the active JScene3D project is no longer the relevant workspace, the project lifecycle must respond according to the defined policy.

Do not leave Java authoring state silently attached to an unrelated workspace.

### 23.26 Do Not Use Workspace Folder Presence as Project Discovery

An arbitrary open folder is not automatically a JScene3D project.

Project discovery or automatic reopen, if implemented, requires an explicit policy and Java validation.

Do not scan and guess merely to populate project state.

### 23.27 Persist Project Intent, Not Live State

If automatic project reopen across extension-host restart is implemented, persist only stable information necessary to request a fresh Java open.

Do not persist as reusable authority:

- generation;
- revision;
- dirty state;
- hierarchy snapshot;
- Inspector projection;
- undo history.

Those belong to the previous Java process/session.

### 23.28 Project Close Clears Project-Scoped State

A completed project close must coherently invalidate:

```text
project summary
generation
revision
project diagnostics
hierarchy
Inspector
dirty state
undo/redo presentation
project-specific subscriptions
```

The Java service itself may remain ready.

### 23.29 Fatal Service Failure Invalidates Project Authority

If the Java service process fails, all TypeScript state that depended on its active project session becomes non-authoritative.

Do not leave the Project, Hierarchy, or Inspector views presenting that information as live state.

The UI may show an unavailable/failed state where appropriate.

### 23.30 Do Not Mix Authoring and Runtime State

Future Play/runtime state is separate from authored project state.

For example:

```text
authored entity position
```

and:

```text
live runtime entity position
```

may differ.

Do not overwrite one with the other.

### 23.31 Runtime Objects May Not Have Authored Counterparts

Future runtime state may contain objects spawned dynamically.

Do not force every runtime object into the authored hierarchy model.

Runtime inspection requires its own identity and mapping semantics.

### 23.32 Authoring Objects May Not Exist at Runtime

Likewise, an authored object may be disabled, unloaded, replaced, or otherwise absent from a running game.

Do not infer runtime existence from authored hierarchy presence.

### 23.33 State Owners Publish Coherent Snapshots

When a state owner changes, consumers should observe a complete coherent state.

Avoid exposing a sequence of partially updated fields during one logical transition.

For example:

```text
project open response
    ↓
validate complete result
    ↓
establish summary + generation + diagnostics
    ↓
publish state change
```

### 23.34 Do Not Expose Mutable State Internals

State owners should expose readonly state or query methods.

Consumers must not receive an internal mutable object and modify it directly.

All state transitions go through the owner.

### 23.35 State Changes Must Be Testable

Tests should cover state transitions independently of presentation where practical.

Important cases include:

```text
closed → opening → open
closed → opening → failed
open → closing → closed
service failure while open
stale open result
stale hierarchy result
stale Inspector result
project generation change
authoring revision change
```

Do not rely exclusively on UI tests to prove lifecycle correctness.

### 23.36 Manual Tests Must Verify State Across Views

When a feature introduces or changes authoring state, manual test instructions must identify the visible effects across relevant Code OSS surfaces.

For example:

```text
1. Open the specified project.
2. Confirm the Code OSS workspace remains unchanged.
3. Confirm the Project view shows the active Project and Java-authoritative root.
4. Confirm Problems reflects the project's diagnostics.
5. Confirm JScene3D Output records the lifecycle.
6. Close the project.
7. Confirm project-scoped views and diagnostics clear.
8. Confirm the Java authoring service remains alive if that is the expected lifecycle.
```

Manual testing should verify coherent application state, not only one successful command.

## 24. Diagnostics and Problems

### 24.1 Use VS Code Problems for Structured Diagnostics

Publish JScene3D project and authoring diagnostics through the native VS Code diagnostics API.

Do not create a separate JScene3D Problems view.

The Problems panel is the standard user-facing location for structured errors and warnings associated with project resources.

### 24.2 Java Is Authoritative for JScene3D Diagnostics

Java owns diagnostics resulting from JScene3D domain behavior, including:

- project descriptor parsing;
- project validation;
- schema validation;
- asset discovery;
- extension metadata;
- definition resolution;
- import state;
- authored hierarchy projection;
- Inspector/domain validation;
- mutations.

TypeScript must not independently reproduce these diagnostic rules.

### 24.3 Preserve Structured Diagnostic Information

Map Java diagnostics into VS Code diagnostics without discarding useful structured information.

Preserve where available:

- severity;
- stable diagnostic code;
- message;
- source URI;
- semantic or JSON location;
- structured details required by the client.

Do not reduce a structured diagnostic to a formatted string before it reaches the presentation boundary.

### 24.4 Keep Wire Diagnostics Separate from VS Code Diagnostics

The Java protocol DTO and `vscode.Diagnostic` serve different purposes.

Conceptually:

```text
ProjectDiagnosticDto
    ↓ runtime validation
validated diagnostic model
    ↓ presentation mapping
vscode.Diagnostic
```

Do not put VS Code types into protocol DTOs.

### 24.5 Map Severity Explicitly

Map Java diagnostic severity deliberately to the corresponding VS Code severity.

Do not infer severity from:

- message text;
- diagnostic code naming;
- source path.

Unknown severity values from the protocol must fail validation according to the compatibility contract rather than being silently guessed.

### 24.6 Preserve Stable Diagnostic Codes

When Java provides a stable diagnostic code, expose it through the VS Code diagnostic where supported.

Codes allow users and developers to distinguish conditions without parsing human-readable messages.

Do not replace Java codes with TypeScript-specific equivalents unless a genuinely TypeScript-owned diagnostic requires its own code.

### 24.7 Preserve Diagnostic Source

Associate a diagnostic with the source URI supplied by Java where possible.

Do not arbitrarily attach every project diagnostic to the selected `.j3d` descriptor.

A diagnostic may belong to:

- the project descriptor;
- another project file;
- an imported definition;
- an asset;
- another authoritative source.

### 24.8 Do Not Invent Source Ranges

If Java does not provide reliable line and column information, do not manufacture precise source coordinates.

Use a conservative valid VS Code range according to the documented mapping policy.

Preserve semantic or JSON location information separately where useful.

### 24.9 Semantic Locations Are Not Text Coordinates

A location such as:

```text
/mainScene
/components/0/type
```

identifies a semantic or JSON location.

It does not imply a particular text line or column.

Do not convert it into guessed source coordinates.

### 24.10 Improve Precision at the Authoritative Boundary

If precise source ranges become important, extend the Java diagnostic/protocol contract to provide authoritative coordinates.

Do not implement a second TypeScript parser solely to recover line numbers for Java diagnostics unless explicitly reviewed as the correct architecture.

### 24.11 Diagnostics Are Scoped to Their Authoritative State

Diagnostics must be associated with the project/session or operation that produced them.

Do not allow diagnostics from:

```text
project generation N
```

to remain presented as current diagnostics for:

```text
project generation N+1
```

unless they genuinely represent persistent external state and the lifecycle explicitly preserves them.

### 24.12 Replace Diagnostics Deliberately

When Java returns a new authoritative diagnostic set for the same scope, replace the previous set according to the operation semantics.

Do not indefinitely append every diagnostic ever received.

This prevents stale and duplicate Problems entries.

### 24.13 Clear Project Diagnostics on Project Close

When the active JScene3D project closes, clear diagnostics scoped to that project.

Do not leave Problems entries implying that a closed project remains the active authoring context.

### 24.14 Failed Open Diagnostics May Remain Visible

When `project/open` fails with structured diagnostics, those diagnostics are useful even though no project session was created.

They may remain visible until:

- another open attempt replaces them;
- the relevant workflow explicitly clears them;
- the extension lifecycle ends.

Do not require an active Java project session merely to show why opening failed.

### 24.15 Successful Open May Still Produce Diagnostics

A successfully opened project may contain warnings or other non-fatal diagnostics.

Do not clear all diagnostics simply because `project/open` succeeded.

Use the diagnostic set returned by Java.

### 24.16 Distinguish Diagnostics from Operational Failures

Not every failure belongs in Problems.

Examples:

```text
invalid project descriptor
    → Problems

missing required project field
    → Problems

Java executable cannot be located
    → Output + user-facing operation failure

protocol initialization incompatible
    → Output + user-facing operation failure

Java process crashes
    → Output + service/project failure state
```

Use Problems for structured source/project diagnostics, not as a generic application error log.

### 24.17 TypeScript-Owned Diagnostics Require Clear Ownership

If TypeScript eventually produces a genuine diagnostic, it must represent a condition TypeScript is authoritative for.

Do not create duplicate TypeScript diagnostics for conditions Java already diagnoses.

Examples of potentially TypeScript-owned problems would need to arise from TypeScript-specific editor integration, not JScene3D domain validation.

### 24.18 Do Not Turn Exceptions into Fake Project Diagnostics

An unexpected TypeScript exception is not automatically a project diagnostic.

Do not create a Problems entry such as:

```text
Internal error: TypeError ...
```

merely to make the failure visible.

Use the appropriate technical error and Output path.

### 24.19 Do Not Duplicate Diagnostics Across Surfaces Unnecessarily

For a failed project open:

```text
Problems
    detailed structured diagnostics

Output
    operational summary/context

Notification
    concise statement that Open Project failed
```

Do not copy every diagnostic message into all three surfaces.

### 24.20 Diagnostic Collections Must Have Clear Ownership

Create and own the JScene3D diagnostic collection at the appropriate extension/application boundary.

Feature code should publish through the responsible diagnostics component rather than creating additional collections independently.

### 24.21 Keep Diagnostic Mapping Focused

The component mapping Java diagnostics to VS Code diagnostics should perform presentation adaptation only.

It may:

- map severity;
- create `vscode.Uri`;
- choose the documented fallback range;
- expose code/source/location appropriately.

It must not reinterpret whether the Java diagnostic is semantically correct.

### 24.22 Invalid Diagnostic DTOs Are Protocol Failures

If a diagnostic received from Java does not satisfy the protocol contract, do not publish a partially guessed VS Code diagnostic.

Reject the malformed response or notification according to the protocol policy.

### 24.23 Diagnostics Must Not Mutate Project State

Publishing a diagnostic must not itself alter authoritative project state.

The operation producing the diagnostic may have its own state transition, but Problems publication is presentation of that result.

### 24.24 Diagnostics Should Be Immutable Snapshots

Treat validated diagnostic collections as immutable snapshots.

Do not allow views or presentation components to modify diagnostic meaning in place.

When authoritative diagnostics change, replace the relevant snapshot.

### 24.25 Diagnostic Updates Must Handle Stale Results

An asynchronous diagnostic-producing operation may complete after:

- project close;
- project replacement;
- service failure;
- a newer operation.

Do not publish stale diagnostics as current.

Use operation identity, generation, revision, or the appropriate lifecycle guard.

### 24.26 Diagnostic Codes Should Be Testable

Tests should verify important diagnostic mappings using stable codes where available rather than relying only on exact human-readable messages.

Messages may evolve while the diagnostic condition remains the same.

Do not make every test dependent on incidental punctuation or wording.

### 24.27 Test Diagnostic Lifecycle

Automated tests should cover relevant cases such as:

```text
valid project with no diagnostics
successful project with warnings
malformed project
semantically invalid project
new open replaces previous diagnostics
project close clears project diagnostics
stale operation does not republish old diagnostics
invalid diagnostic DTO is rejected
```

Test both retained state and VS Code presentation mapping where appropriate.

### 24.28 Manual Tests Must Include Problems

When a feature can produce diagnostics, manual test instructions must explicitly state what should appear in Problems.

For example:

```text
1. Run `JScene3D: Open Project`.
2. Select `semantic-invalid.j3d`.
3. Open the Problems panel.
4. Verify the expected number and severity of diagnostics.
5. Verify the diagnostic codes.
6. Verify the source resource is correct.
7. Verify the JSON location is preserved where provided.
```

Do not merely state that opening the invalid project should fail.

### 24.29 Manual Tests Must Verify Diagnostic Clearing

When project lifecycle changes affect diagnostics, manual instructions must verify the clearing/replacement behavior.

For example:

```text
1. Open an invalid project and confirm Problems contains diagnostics.
2. Open or close according to the supported lifecycle.
3. Verify stale diagnostics are removed at the expected point.
```

This guards against a common failure where correct diagnostics become misleading because their lifecycle is wrong.

### 24.30 Prefer Correct Diagnostics Over Rich Presentation

Early implementations should prioritize:

- correct source;
- correct severity;
- correct code;
- correct lifecycle;
- correct authoritative message.

Precise text ranges, richer related information, and advanced navigation can be added when the Java protocol provides reliable data.

Do not duplicate parsers or domain logic merely to make Problems entries visually richer.

## 25. Testing Standards

### 25.1 Test Behavior and Contracts

Tests should verify observable behavior, state transitions, and architectural contracts.

Do not write tests merely to execute lines or increase coverage.

A useful test should make clear what behavior would regress if it failed.

### 25.2 Use the Smallest Appropriate Test Level

Prefer the cheapest test level that proves the behavior correctly.

Use:

```text
unit tests
    pure logic, state transitions, framing, validation, mapping

component/service tests
    collaboration between TypeScript components

real-process integration tests
    Java ↔ TypeScript protocol and lifecycle

VS Code integration tests
    actual extension API behavior

manual tests
    user-visible end-to-end workflows
```

Do not use full UI automation for logic that can be tested reliably below the UI layer.

### 25.3 Pure Logic Should Be Tested Without VS Code

Code such as:

- Content-Length framing;
- DTO validation;
- JSON-RPC correlation;
- state transitions;
- stale-result protection;
- protocol mapping;

should normally be testable without launching Code OSS.

Do not unnecessarily couple pure logic tests to the VS Code extension host.

### 25.4 State Owners Require Transition Tests

Components owning mutable lifecycle state must have tests for their meaningful transitions.

For example, project state should cover relevant transitions such as:

```text
closed → opening → open
closed → opening → failed
open → closing → closed
open → service failure
```

Also test invalid or stale transitions where they are meaningful.

### 25.5 Test Asynchronous Races Deliberately

Important asynchronous behavior requires deterministic race tests.

Examples include:

- duplicate Java service startup;
- project close while open is pending;
- stale open response after close;
- out-of-order JSON-RPC responses;
- process exit with pending requests;
- stale hierarchy response;
- stale Inspector response;
- extension disposal during activity.

Use controlled promises, fake transports, or other deterministic mechanisms.

Do not use sleeps to manufacture races.

### 25.6 Framing Requires Boundary Tests

Content-Length framing tests must include representative stream behavior such as:

- complete frame;
- partial header;
- partial payload;
- multiple frames in one chunk;
- UTF-8 multibyte payload;
- maximum/bounded payload behavior;
- malformed header;
- invalid Content-Length;
- invalid UTF-8 where applicable;
- invalid JSON;
- EOF with incomplete frame.

Do not assume Node stream chunking aligns with protocol messages.

### 25.7 JSON-RPC Requires Correlation Tests

The JSON-RPC client should test:

- monotonically assigned request IDs;
- matching responses to requests;
- responses arriving out of order;
- protocol error responses;
- unknown response IDs according to defined policy;
- pending-request rejection on transport failure;
- pending-request rejection on process termination.

Do not rely only on sequential happy-path requests.

### 25.8 DTO Validators Require Positive and Negative Tests

For every important wire DTO, test representative valid and invalid values.

Negative cases should include meaningful contract failures such as:

- missing required fields;
- wrong primitive types;
- invalid literal/discriminant;
- malformed nested objects;
- invalid arrays;
- invalid integer fields;
- unexpected `null`.

Do not generate huge combinatorial malformed-input suites without a concrete benefit.

### 25.9 Use Production Validators in Tests

Protocol fixtures and real-process responses must pass through the same runtime validators used by production code.

Do not create permissive test-only parsing paths.

### 25.10 Maintain Cross-Language Contract Tests

Java and TypeScript must have automated protection against protocol drift.

The permanent contract strategy should ensure both sides validate the same canonical expectations.

TypeScript-only fixtures are useful but are not sufficient as the final cross-language strategy.

### 25.11 Keep Real Java Process Tests

Important protocol milestones require tests against the actual Java authoring service.

These tests verify:

- process launch;
- framing compatibility;
- initialization;
- DTO compatibility;
- project operations;
- diagnostics;
- shutdown.

Do not replace all real-process tests with mocks after the protocol becomes stable.

### 25.12 Do Not Make Every Test a Real-Process Test

Real-process tests are slower and have more environmental dependencies.

Use them to verify the process boundary.

Use focused unit/component tests for:

- framing edge cases;
- request correlation;
- state transitions;
- DTO validation;
- presentation mapping.

### 25.13 Fake Dependencies at Architectural Boundaries

When a component needs controlled behavior in a test, fake the meaningful dependency boundary.

Examples include:

```text
process launcher
message transport
authoring service client
project-state consumer
```

Do not mock every internal method of the class under test.

Tests should remain resilient to internal refactoring.

### 25.14 Prefer Fakes Over Brittle Interaction Mocks

Where practical, use small fake implementations that model meaningful behavior.

Avoid tests that primarily assert long sequences such as:

```text
method A called once
method B called twice
method C called after B
```

unless that interaction order is itself the contract.

Test outcomes and state whenever possible.

### 25.15 Do Not Add Production APIs Solely for Tests

Do not expose private implementation state merely so a test can inspect it.

Test through supported behavior or introduce a meaningful dependency boundary.

If testing is extremely difficult, first consider whether responsibility or ownership is unclear.

### 25.16 Test Error State as Well as the Error

A failure-path test should verify both:

1. the expected error/outcome; and
2. the resulting application state.

For example, after failed project open verify:

```text
no active project generation
no false open state
diagnostics retained appropriately
Project view state appropriate
```

Do not stop at asserting that a promise rejected.

### 25.17 Test Cleanup

Lifecycle-owning components require cleanup tests.

Verify, where relevant:

- subscriptions disposed;
- pending requests rejected;
- transport closed;
- project state cleared;
- diagnostic state cleared;
- Java process terminated on extension shutdown;
- Java process remains alive after project close when expected.

### 25.18 Test Repeated Lifecycle

Important resources should be tested across repeated valid use where supported.

Examples include:

```text
open → close → open
start service → close project → reuse service
subscribe → dispose → subscribe again
```

This catches leaked listeners and stale state that a one-shot test misses.

### 25.19 Test Semantic Identity

Hierarchy and Inspector tests must verify semantic identity rather than presentation labels.

For repeated reusable definitions, tests should prove that distinct occurrences receive distinct occurrence identities.

Do not test identity by relying on array position or displayed name.

### 25.20 Test Typed Inspector Data

Inspector tests should verify:

- typed values;
- value kinds;
- origins;
- constraints;
- editability;
- mutation targets;
- generated/read-only targets.

Do not reduce Inspector tests to checking formatted strings.

### 25.21 Test Mutation Authority

Future mutation tests should verify:

- valid typed mutation succeeds;
- invalid typed mutation is rejected by Java;
- stale revision is rejected;
- authoritative revision changes appropriately;
- dirty state changes appropriately;
- resulting projection reflects Java state;
- undo/redo behavior remains authoritative.

Do not test TypeScript as though it owns mutation semantics.

### 25.22 Test Diagnostics by Stable Information

Prefer assertions on:

- severity;
- diagnostic code;
- source;
- structured location;

where those fields define the contract.

Avoid depending unnecessarily on exact message punctuation or wording.

### 25.23 Test Diagnostic Lifecycle

Cover:

```text
diagnostics on failed open
warnings on successful open
replacement by newer diagnostics
clearing on close
stale diagnostics rejected
```

Correct diagnostic content with incorrect lifecycle is still a bug.

### 25.24 Test Presentation Mapping Separately

Where useful, test mappings such as:

```text
ProjectSummary → Project view items
ProjectDiagnostic → vscode.Diagnostic
HierarchyNode → TreeItem
InspectorProperty → presentation model
```

Keep these tests focused on presentation behavior.

Do not retest Java domain semantics in TypeScript mapping tests.

### 25.25 Use VS Code Integration Tests Selectively

Use actual extension-host tests when the behavior under test depends on VS Code itself.

Examples include:

- command registration;
- context-key behavior;
- diagnostic publication;
- workspace lifecycle;
- actual tree-provider integration;
- extension activation/disposal.

Do not use extension-host tests merely because the production code imports `vscode` if the behavior can be isolated cleanly.

### 25.26 Avoid Timing-Dependent Tests

Do not use arbitrary waits such as:

```typescript
await delay(500);
```

to hope an asynchronous event has occurred.

Wait for:

- a promise;
- an event;
- an explicit state transition;
- controlled fake completion.

Timing-based tests are slow and flaky.

### 25.27 Test Timeouts Are Safety Nets

Test-runner timeouts prevent hung tests.

They are not synchronization mechanisms.

A test should normally complete because it observed the expected deterministic condition, not because enough time elapsed.

### 25.28 Keep Fixtures Small and Purpose-Built

Use small fixture projects for:

- valid project;
- malformed descriptor;
- semantic-invalid project;
- hierarchy identity;
- Inspector projection;
- mutation behavior.

Do not use a large demo game as the only test fixture.

Small fixtures make failures easier to diagnose.

### 25.29 Real Projects Are Useful as Additional Smoke Tests

Larger real projects may be used as additional integration/manual tests.

They should not replace focused fixtures.

A failure in a large project should not require debugging hundreds of unrelated assets to understand the test's purpose.

### 25.30 Tests Must Not Depend on Developer-Specific Paths

Do not hard-code local checkout paths in committed tests.

Resolve fixtures relative to the repository/test environment or use explicit test configuration.

Development environment variables may be used for external Java artifacts where the test architecture requires them, but the dependency must be documented.

### 25.31 Keep Test Output Useful

Tests should fail with enough information to understand the violated contract.

Do not print large protocol payloads or entire project trees on every successful run.

Verbose diagnostics may be emitted on failure where useful.

### 25.32 Follow Code OSS Test Conventions

Use the existing Code OSS test infrastructure, assertion libraries, file placement, and naming conventions for the area being modified.

Do not introduce a second TypeScript test framework solely for JScene3D without a concrete requirement.

### 25.33 Run Focused Tests During Development

During implementation, run the smallest relevant test and static-analysis set frequently.

Do not wait until the end to discover:

- TypeScript errors;
- ESLint errors;
- protocol test failures;
- lifecycle regressions.

### 25.34 Run Required Final Quality Gates

Before reporting a TypeScript change complete, run the appropriate Code OSS checks for the changed surface.

At minimum, where applicable:

```text
TypeScript compilation
ESLint
focused automated tests
git diff --check
```

Run broader repository checks when required by the affected Code OSS area or when the change has broader impact.

Do not claim verification that was not actually run.

### 25.35 Coverage Must Not Drive Bad Tests

If coverage requirements apply, satisfy them with meaningful behavioral tests.

Do not:

- exclude important code merely to improve percentages;
- add tests that execute code without assertions;
- distort production architecture for easier coverage.

Coverage is a signal, not the purpose of testing.

### 25.36 Every Manually Testable Feature Requires Instructions

Whenever a Codex task produces user-visible or lifecycle behavior that can be manually tested, its required output must include a section named:

```text
Manual Test Instructions
```

The instructions must be written for the developer to execute after Codex finishes.

Do not merely report that Codex performed manual testing.

### 25.37 Manual Test Instructions Must Be Exact

Manual instructions must include, where applicable:

- prerequisite build command;
- required environment variables or settings;
- exact POC launch command;
- exact command-palette command or UI action;
- exact fixture/project to select;
- expected Project/Hierarchy/Inspector state;
- expected Explorer/workspace state;
- expected Problems entries;
- expected JScene3D Output messages;
- expected notifications;
- expected Java process lifecycle;
- shutdown verification.

Do not write vague instructions such as:

```text
Test opening a project.
```

### 25.38 Manual Instructions Must Include Failure Paths

When a feature has meaningful failure behavior, include representative failure scenarios.

For project opening, for example:

```text
valid project
malformed descriptor
semantically invalid descriptor
```

State what the developer should observe for each case.

### 25.39 Manual Instructions Must Use the Correct POC

Manual instructions must identify the correct Code OSS POC application and launch workflow.

Do not risk opening or modifying an installed production JScene3D application.

Where isolated user-data or extension directories are required, include them.

### 25.40 Manual Verification Does Not Replace Automated Tests

Manual testing verifies actual user-visible integration.

Automated tests verify contracts, edge cases, races, and repeatability.

A feature requiring both is not complete when only one has been performed.

## 26. Testability and Dependency Injection

### 26.1 Design for Testability Through Clear Boundaries

Code should be testable because responsibilities and dependencies are well separated.

Do not distort production architecture merely to make tests easier.

Good testability should normally follow from:

- explicit dependencies;
- narrow interfaces;
- clear state ownership;
- isolated side effects;
- deterministic asynchronous behavior.

### 26.2 Inject External Boundaries

Dependencies representing external systems or significant side effects should normally be supplied explicitly.

Examples include:

- process launch;
- protocol transport;
- authoring-service client;
- filesystem access where isolated behavior is required;
- VS Code presentation boundaries where useful.

This allows tests to control the boundary without reproducing the implementation.

### 26.3 Do Not Inject Everything

Dependency injection is not a goal by itself.

Do not inject:

- ordinary value objects;
- pure functions;
- standard collection constructors;
- trivial language utilities;
- constants;

merely to make every dependency configurable.

Inject dependencies when doing so establishes a meaningful architectural or testing boundary.

### 26.4 Prefer Constructor Injection for Required Dependencies

When an object cannot operate correctly without a dependency, provide that dependency when the object is constructed.

Prefer:

```typescript
class ProjectState {
 constructor(
  private readonly authoringService: AuthoringService
 ) {}
}
```

over mutable setter injection such as:

```typescript
const state = new ProjectState();
state.setAuthoringService(service);
```

unless the dependency genuinely changes during the object's lifetime.

### 26.5 Avoid Service Locators

Do not obtain dependencies through a global registry such as:

```text
ServiceLocator
ApplicationServices
GlobalContext
JScene3DServices
```

Service locators hide dependencies and make tests harder to reason about.

The extension activation layer should construct and connect major services explicitly.

### 26.6 Avoid Dependency Containers Without Need

Do not introduce a dependency-injection framework or generic container for JScene3D.

The number of long-lived components should remain small enough that explicit construction is understandable.

If composition becomes complex, first review whether responsibilities have become too fragmented.

### 26.7 Inject Narrow Contracts

A consumer should depend on the smallest capability it needs.

For example, a project-state component that needs to open and close projects does not necessarily need every future capability of the complete authoring service.

Use a narrow interface when that boundary provides meaningful isolation.

Do not create narrow interfaces mechanically when the concrete dependency is already small and stable.

### 26.8 Interfaces Should Represent Real Boundaries

Useful test boundaries include concepts such as:

```text
process launcher
message transport
authoring protocol client
authoring service
```

These represent genuine external or architectural seams.

Do not create interfaces solely because a mocking library expects them.

### 26.9 Prefer Fakes for Stateful Boundaries

For stateful collaborators, a small fake implementation is often clearer than a large set of method mocks.

For example, a fake authoring service can deliberately produce:

```text
successful open
failed open
delayed open
service failure
```

This makes state-transition tests easier to understand.

### 26.10 Fakes Must Model Only the Required Contract

Do not build a second implementation of the Java authoring service in TypeScript test code.

A fake should provide only enough controlled behavior for the test.

It must not duplicate Java domain rules.

### 26.11 Do Not Mock Java Domain Semantics into TypeScript

Tests of TypeScript presentation may use representative Java-derived DTOs or application state.

Do not implement fake Java validation, hierarchy projection, Inspector semantics, or mutation rules in TypeScript merely to make tests realistic.

Those behaviors belong in Java tests and real-process integration tests.

### 26.12 Pure Functions Need No Dependency Injection

A pure transformation such as:

```text
ProjectDiagnostic → vscode.Diagnostic
```

should normally be tested directly.

Do not wrap every pure function in an injectable service.

### 26.13 Isolate Process Creation

Code that invokes Node child-process APIs should be isolated behind the process-launch/supervision responsibility.

Feature tests should not accidentally start Java merely because they constructed an application component.

Real-process tests should opt into the real launcher deliberately.

### 26.14 Isolate Transport from Process Tests

Protocol and framing tests should be able to use controlled streams or transports without starting Java.

Real Java process tests then verify that the same production transport works against the actual service.

This gives fast deterministic coverage and real integration confidence.

### 26.15 Make Asynchronous Tests Controllable

Dependencies involved in asynchronous workflows should allow tests to control completion deterministically.

For example, a fake operation may expose a promise whose resolution the test controls.

This allows testing:

```text
open starts
close occurs
open response arrives
```

without arbitrary delays.

### 26.16 Do Not Add Production Sleep or Timing Hooks for Tests

Do not add configurable delays, sleeps, or timing switches to production code merely so tests can create race conditions.

Control the dependency or promise boundary instead.

### 26.17 Avoid Private-State Testing

Do not access private fields through casts or reflection-like techniques merely to assert implementation details.

Test:

- public state;
- events;
- observable operations;
- owned side effects.

If essential behavior cannot be observed through the supported contract, reconsider whether the contract is too narrow or the responsibility is misplaced.

### 26.18 Do Not Export Internals Solely for Tests

Keep implementation details private even when testing them would be convenient.

Prefer testing through the owning public behavior.

A helper may be exported when it is itself a meaningful independently testable contract, not simply to bypass visibility.

### 26.19 Presentation Boundaries May Need Small Adapters

VS Code APIs can make isolated testing difficult when used directly throughout application logic.

Where there is a meaningful boundary, isolate presentation side effects behind a focused component.

Examples already include:

```text
ProjectDiagnostics
ProjectView
Output ownership
```

Do not wrap the entire `vscode` namespace in a generic abstraction.

### 26.20 Do Not Build a Fake VS Code Platform

Use actual VS Code integration tests for behavior that genuinely depends on VS Code.

Do not create an extensive internal imitation of:

- workspaces;
- commands;
- tree views;
- diagnostics;
- extension contexts.

Small controlled substitutes are acceptable for focused application tests.

### 26.21 Keep Construction Explicit in Tests

Tests should be able to see which dependencies are being supplied to the component under test.

Avoid hidden test-global initialization that silently changes application behavior.

Explicit construction makes failures easier to understand.

### 26.22 Reset Test-Owned State Between Tests

Tests must not depend on execution order or state left by previous tests.

Dispose test-owned:

- services;
- subscriptions;
- diagnostic collections;
- fake transports;
- child processes.

Do not rely on the test runner process ending to clean everything up.

### 26.23 Real-Process Tests Must Own Their Process

A test that starts the real Java authoring service is responsible for terminating it.

Successful and failed test paths must both clean up.

A failed assertion must not leave an orphan Java process.

### 26.24 Keep Test Fixtures Independent

A test fixture should represent the scenario under test without requiring unrelated project setup.

Prefer separate small fixtures for:

```text
valid project
malformed descriptor
semantic validation failure
hierarchy reuse
Inspector mutation
```

rather than one fixture accumulating every feature.

### 26.25 Avoid Brittle Mock Expectations

Do not make tests depend on incidental internal call sequences.

For example, avoid asserting that:

```text
method A called
then method B
then method C
```

when the real contract is simply:

```text
project ends in open state with the returned summary
```

Interaction assertions are appropriate when the interaction itself is the contract, such as ensuring a stale Java session is explicitly closed.

### 26.26 Dependency Injection Must Preserve Ownership

Injecting a dependency does not transfer lifecycle ownership automatically.

Tests and production code must follow the same ownership rules.

If a component receives an externally owned fake transport, its disposal behavior should match the production contract for that dependency.

### 26.27 Test Doubles Must Not Hide Architectural Problems

If testing a component requires faking a very large object with dozens of unrelated methods, that is evidence the dependency may be too broad.

Do not respond by generating a larger mock automatically.

Review the dependency boundary.

### 26.28 Keep Test-Specific APIs Out of Production Contracts

Avoid production methods such as:

```text
resetForTest()
forceStateForTest()
waitForTest()
setInternalGenerationForTest()
```

Use controllable dependencies and supported operations instead.

If a test hook is unavoidable because of host infrastructure, isolate and document it clearly.

### 26.29 Testability Is Part of Design Review

When adding a new long-lived component, ask:

- what does it own?
- what external boundaries does it depend on?
- can its state transitions be tested deterministically?
- can failures be injected?
- can it be disposed without global cleanup?
- does testing require launching VS Code or Java unnecessarily?

If the answers are unclear, refine the design before implementation grows.

### 26.30 Manual Test Instructions Remain Independent of Test Doubles

Manual test instructions must exercise the real implementation.

Do not instruct the developer to enable fake services, mocked protocol responses, or test-only state.

Manual verification exists to confirm the actual Code OSS ↔ Java integration and user-visible behavior.

## 27. Code Quality and Static Analysis

### 27.1 Treat Quality Gates as Requirements

TypeScript compilation, linting, tests, and repository quality checks are part of the implementation contract.

Do not treat them as optional cleanup performed after feature development.

New code should satisfy the applicable checks continuously during development.

### 27.2 Do Not Weaken Existing Quality Gates

Do not change:

- TypeScript compiler strictness;
- ESLint configuration;
- repository lint rules;
- test configuration;
- other Code OSS quality gates;

merely to make new JScene3D code pass.

If an existing rule conflicts with a legitimate architectural requirement, stop and review the conflict rather than disabling the rule locally.

### 27.3 Do Not Suppress Warnings Without Justification

Avoid suppression mechanisms such as:

```typescript
// eslint-disable-next-line ...
```

unless:

1. the code is correct;
2. the rule genuinely does not apply;
3. there is no clearer compliant implementation;
4. the reason is documented where it is not obvious.

Do not use suppressions to avoid fixing ordinary code-quality problems.

### 27.4 Do Not Bypass the Type System

Do not make compilation succeed through:

- `any`;
- unsafe assertions;
- double assertions;
- unnecessary non-null assertions;
- broad casts;
- weakening types to `unknown` and immediately asserting them back.

Fix the underlying typing or API design.

### 27.5 Keep the Compiler Clean

New JScene3D TypeScript should compile without TypeScript errors.

Do not knowingly leave errors in changed JScene3D code because another milestone will address them later.

If unrelated pre-existing repository errors prevent a broader compilation command, document them and still run the narrowest authoritative check for the changed surface.

### 27.6 Keep ESLint Clean

Run ESLint against the changed JScene3D TypeScript surface.

Resolve violations rather than accumulating a JScene3D-specific suppression layer.

Follow Code OSS lint rules even when a different personal TypeScript style would also be reasonable.

### 27.7 Use Repository Formatting

Follow Code OSS formatting conventions.

Do not introduce an independent formatter configuration for JScene3D.

Do not reformat unrelated Code OSS files merely because they are touched by the same task.

### 27.8 Keep Diffs Focused

A feature change should contain changes required for that feature and directly necessary cleanup.

Avoid mixing:

- unrelated renaming;
- broad formatting;
- opportunistic refactoring;
- unrelated dependency updates;
- unrelated comment cleanup;

into the same implementation.

Focused diffs are easier to review and safer to revert.

### 27.9 Run `git diff --check`

Before reporting work complete, run:

```text
git diff --check
```

Whitespace errors must be corrected.

Do not rely solely on editor formatting.

### 27.10 Review the Final Diff

Before completion, inspect the complete working-tree diff.

Confirm that:

- every changed file belongs to the task;
- no generated files were accidentally added;
- no temporary debugging code remains;
- no developer-specific paths were introduced;
- no unrelated files changed;
- no test fixture contains accidental local data.

### 27.11 Do Not Commit Generated Build Output

Generated TypeScript/JavaScript build artifacts should follow the existing Code OSS repository policy.

Do not commit ignored `out` content or temporary compilation output merely because it was produced during verification.

### 27.12 Remove Debugging Code

Before completion, remove temporary:

- `console.log` statements;
- payload dumps;
- test-only branches;
- hard-coded fixture paths;
- temporary sleeps;
- debug commands;
- commented-out implementations.

Permanent operational logging belongs through the defined JScene3D Output path.

### 27.13 Avoid `console.log` in Production JScene3D Code

Do not use `console.log` as the normal logging mechanism.

Use the owned JScene3D Output channel for operational information.

Console output may be appropriate only where Code OSS infrastructure specifically expects it or during temporary local debugging that is removed before completion.

### 27.14 Keep Functions and Classes Understandable

There is no arbitrary maximum line count for a function or class.

However, large implementations should be reviewed for mixed responsibilities.

Signals that code may need decomposition include:

- several unrelated reasons to change;
- deeply nested control flow;
- many injected dependencies;
- large numbers of mutable fields;
- lifecycle and presentation mixed together;
- repeated branching on unrelated modes.

Do not split code mechanically to satisfy a size target.

### 27.15 Keep Control Flow Shallow Where Practical

Prefer:

- early validation;
- guard clauses;
- explicit state handling;

over deeply nested conditionals.

For example, handle invalid lifecycle state before entering the main operation rather than nesting the complete implementation inside several `if` blocks.

Do not sacrifice clarity merely to minimize nesting numerically.

### 27.16 Avoid Excessive Complexity

Complex branching, state transitions, and concurrency logic should be made explicit and testable.

When a method becomes difficult to reason about, consider:

- extracting a coherent pure operation;
- modeling states explicitly;
- moving responsibility to the correct owner;
- simplifying the workflow.

Do not hide complexity behind generic helper names.

### 27.17 Avoid Duplication of Behavior

Do not duplicate:

- protocol validation;
- state-transition logic;
- diagnostic mapping;
- process lifecycle behavior;
- Java-authoritative domain rules.

Extract shared behavior when duplication represents the same responsibility.

Do not eliminate small incidental duplication by introducing a confusing abstraction.

### 27.18 Do Not Duplicate Constants Across Boundaries

Stable protocol method names, capability names, command IDs, context keys, and similar constants should have one appropriate owner within TypeScript.

Do not scatter repeated string literals through unrelated files.

Do not create one giant global constants file containing unrelated concepts.

### 27.19 Remove Dead Code

Do not retain unused implementations because they may become useful later.

Version control already preserves history.

Remove:

- unused exports;
- obsolete helpers;
- abandoned POC implementations;
- unreachable branches;
- old compatibility paths no longer required.

Do not keep dead code commented out.

### 27.20 Do Not Preserve Legacy Architecture Without a Requirement

The old JavaFX editor architecture is not a compatibility target for Code OSS TypeScript.

Do not reproduce:

- editor workbench abstractions;
- global editor selection;
- Java-side view models;
- callback property editors;
- custom command registries;

merely because similar concepts existed previously.

Implement against the permanent Code OSS architecture.

### 27.21 Avoid Premature Generalization

Do not generalize code for hypothetical:

- multiple protocol transports;
- multiple Java implementations;
- multiple project sessions;
- alternative editors;
- alternative RPC protocols;

unless those are actual supported requirements.

Design current boundaries so they can evolve without implementing unused flexibility.

### 27.22 New Dependencies Require Justification

Do not add an npm dependency merely to avoid writing a small amount of straightforward TypeScript.

Before adding a dependency, consider:

- whether Code OSS already provides the capability;
- whether the JavaScript/TypeScript standard library provides it;
- maintenance cost;
- security implications;
- bundle impact;
- licensing;
- whether the dependency is already present in the repository.

A new dependency should solve a real problem.

### 27.23 Avoid Generic Frameworks for Small Problems

Do not introduce frameworks for:

- events;
- dependency injection;
- state management;
- runtime validation;
- logging;
- command routing;

when the existing Code OSS APIs and focused TypeScript code are sufficient.

Framework adoption creates long-term architectural commitment.

### 27.24 Prefer Explicit Code Over Clever Code

A few additional straightforward lines are preferable to a compact abstraction that obscures:

- state ownership;
- protocol semantics;
- lifecycle;
- error behavior;
- types.

Optimize for maintainability and reviewability.

### 27.25 Static Analysis Must Run on New Files

Ensure newly added TypeScript files are included in the relevant:

- TypeScript project;
- ESLint scope;
- test configuration.

A new file that is accidentally excluded from quality checks is not considered verified.

### 27.26 Tests Are Part of Code Quality

A change that compiles and lints but lacks meaningful tests for new logic is incomplete.

Tests should cover the important:

- behavior;
- state transitions;
- failures;
- races;
- lifecycle.

Do not equate static-analysis success with functional correctness.

### 27.27 Manual Verification Is Part of User-Facing Quality

A user-visible integration change is not fully verified merely because automated tests pass.

Where manual testing is applicable, verify the actual POC behavior and provide reproducible `Manual Test Instructions`.

### 27.28 Verification Claims Must Be Exact

Report only checks actually run.

Prefer:

```text
TypeScript compilation: passed
ESLint: 15 files checked, passed
Focused Mocha: 25 tests passed
git diff --check: passed
```

over:

```text
Everything passes.
```

If a broad suite was not run, say so.

### 27.29 Distinguish Pre-Existing Failures

If a broader quality check fails because of unrelated pre-existing repository issues:

1. identify the failure;
2. determine whether the current change caused it;
3. run the narrowest authoritative checks for the changed area;
4. report the limitation accurately.

Do not silently ignore the failure.

Do not fix unrelated code without authorization merely to obtain a green command.

### 27.30 New Code Must Not Increase Known Technical Debt Silently

If a necessary implementation introduces a temporary limitation or debt, document it explicitly.

Examples include:

- development-only Java discovery;
- fallback diagnostic ranges;
- deferred crash recovery;
- deferred protocol fixture generation.

Do not hide temporary architecture inside apparently permanent code.

### 27.31 Prefer Fixing Root Causes

When a lint, type, test, or architectural problem appears, fix the underlying issue where practical.

Do not accumulate:

- suppressions;
- casts;
- wrappers;
- special cases;

around a flawed ownership or API boundary.

### 27.32 Quality Review Includes Architecture

Code quality is not limited to formatting and linting.

Before completion, review whether the implementation still respects:

- Java authority;
- protocol boundaries;
- state ownership;
- lifecycle ownership;
- VS Code API boundaries;
- dependency direction;
- testability.

Code that passes ESLint but violates these boundaries is not acceptable.

### 27.33 Codex Tasks Must Report Verification

Implementation prompts for Codex must require a final verification report containing:

- checks run;
- test counts where available;
- manual verification performed by Codex where appropriate;
- `git diff --check`;
- exact Git status/diff summary;
- known limitations;
- confirmation that nothing was committed unless committing was explicitly requested.

### 27.34 Codex Tasks Must Provide Manual Test Instructions

When a task produces manually testable behavior, the prompt must require Codex to provide a separate:

```text
Manual Test Instructions
```

section for the developer.

This is required even if Codex already performed its own manual verification.

The instructions must be reproducible and specific to the implemented feature.

## 28. Documentation and Comments

### 28.1 Prefer Self-Explanatory Code

Names, types, ownership, and control flow should make the implementation understandable without extensive comments.

Prefer improving unclear code over adding a comment that explains what confusing code happens to do.

Comments should add information that cannot be expressed clearly through the code itself.

### 28.2 Document Why, Not What

Do not write comments that merely restate the code.

Avoid:

```typescript
// Increment the request ID.
requestId++;
```

A useful comment explains a non-obvious reason, constraint, or architectural decision.

For example:

```typescript
// Request IDs are connection-local. A new transport starts a new sequence
// because responses from a previous connection must never match new requests.
```

### 28.3 Document Architectural Constraints

Comments are appropriate when code exists because of an important constraint that a future developer might otherwise remove accidentally.

Examples include:

- Java stdout is protocol-only;
- Content-Length is measured in UTF-8 bytes;
- project generation and authoring revision have different semantics;
- Java owns project validation;
- a stale asynchronous result must not update current state;
- project close intentionally leaves the Java service running.

Keep such comments close to the code enforcing the constraint.

### 28.4 Document Non-Obvious Lifecycle Decisions

Where lifecycle behavior is not obvious from the API, document the reason.

For example:

```text
closing a project does not stop the authoring service
```

is worth documenting at the lifecycle owner because a future developer might reasonably assume otherwise.

Do not repeat the same lifecycle explanation throughout every caller.

### 28.5 Document Concurrency Invariants

Concurrency-sensitive code should document invariants that are difficult to infer locally.

Examples include:

- which operation supersedes another;
- why an operation token is required;
- which generation a result belongs to;
- why a late response is discarded;
- why a pending request must be rejected on transport loss.

Do not rely on a test name alone to explain subtle production behavior.

### 28.6 Document Temporary Limitations

Temporary POC or integration limitations that affect behavior should be documented where relevant.

Examples include:

- development-only Java service discovery;
- fallback diagnostic ranges;
- lack of automatic crash recovery;
- deferred expected-generation project close;
- incomplete cross-language fixture generation.

Make it clear that the limitation is intentional rather than accidental.

### 28.7 Do Not Scatter TODO Comments

Do not use `TODO` as a substitute for design or issue tracking.

A TODO is appropriate only when:

- the remaining work is specific;
- the reason it cannot be completed now is clear;
- the comment is located where the limitation matters.

Avoid vague comments such as:

```typescript
// TODO improve this
```

Prefer a precise statement of the deferred requirement.

### 28.8 Do Not Leave Historical Commentary in Production Code

Avoid comments describing implementation history such as:

```text
This used to work like...
Codex originally generated...
The old JavaFX editor did...
Stage 1 used...
```

unless that history is essential to understanding a current compatibility constraint.

Architecture reports and version control preserve implementation history.

Production comments should explain the current system.

### 28.9 Do Not Reference Chat or Prompt History

Production code and documentation must not depend on knowledge of:

- ChatGPT conversations;
- Codex prompts;
- temporary handover discussions;
- individual development sessions.

Record durable architectural decisions in repository documentation.

### 28.10 Use JSDoc for Supported Contracts Where It Adds Value

Use JSDoc for exported types, functions, methods, and classes when their contract, lifecycle, ownership, or semantics are not sufficiently obvious from the declaration.

Useful JSDoc may describe:

- ownership;
- units;
- lifecycle;
- concurrency;
- error behavior;
- protocol semantics;
- identity semantics.

Do not add JSDoc mechanically to every exported declaration if it would merely repeat the name and type.

### 28.11 Avoid Meaningless JSDoc

Do not write documentation such as:

```typescript
/**
 * Gets the project.
 *
 * @returns The project.
 */
getProject(): ProjectSummary;
```

when the signature already communicates everything.

Documentation should provide additional semantic value.

### 28.12 Document Units

When a numeric value has a unit that is not obvious from its type, document it.

Examples include:

```text
milliseconds
bytes
frame counts
revision numbers
```

Prefer names that include the unit where practical:

```typescript
timeoutMs
payloadBytes
```

Do not rely solely on comments when the identifier can express the unit.

### 28.13 Document Identity Semantics

Opaque or semantic identity types should explain what makes two identities equal and the scope in which they are valid.

This is particularly important for:

- project-session generation;
- hierarchy occurrence identity;
- Inspector targets;
- mutation targets;
- future runtime identities.

Do not leave callers to infer whether an ID is globally stable, project-scoped, session-scoped, or revision-scoped.

### 28.14 Document Protocol Semantics at the Protocol Boundary

Wire DTO documentation should explain semantics that are not evident from the field type.

For example:

```text
generation
    identifies the Java project-session lifetime

revision
    identifies authoritative authored state within that session
```

Do not duplicate the entire Java protocol specification in TypeScript comments.

Keep detailed cross-language architecture in the integration documentation.

### 28.15 Keep Documentation Synchronized with Code

When changing behavior, update relevant documentation in the same task.

Do not knowingly leave:

- obsolete method descriptions;
- outdated lifecycle diagrams;
- incorrect command names;
- stale protocol examples;
- invalid manual testing instructions.

Documentation that contradicts the implementation is worse than missing documentation.

### 28.16 Code Comments Are Not a Substitute for Architecture Documents

Cross-cutting decisions belong in durable architecture or standards documents.

Examples include:

- authoring versus runtime process ownership;
- Java versus TypeScript authority;
- protocol compatibility policy;
- Code OSS integration architecture.

Source comments should explain how the local implementation participates in those decisions.

### 28.17 Keep Architecture Documents Focused

Do not create a new architecture document for every implementation milestone.

Create or update a durable document when the information will remain useful beyond the immediate task.

Implementation reports may record milestone-specific details separately.

### 28.18 Implementation Reports Describe What Actually Happened

When a Codex task requires an implementation report, record:

- implemented scope;
- important architectural decisions;
- files/components changed;
- tests and checks actually run;
- manual verification actually performed;
- known limitations;
- exact Git state where requested.

Do not present planned work as completed work.

### 28.19 Keep Reports Concise

Implementation reports are handover and review artifacts, not transcripts.

Do not reproduce:

- entire source files;
- every command output;
- the full prompt;
- lengthy explanations already available in architecture documents.

Include enough detail to review the implementation and continue development safely.

### 28.20 Manual Test Instructions Are a Required Deliverable

For manually testable work, provide a dedicated section titled:

```text
Manual Test Instructions
```

This section is for the developer to execute independently after the implementation is complete.

It is separate from any manual verification Codex performed itself.

### 28.21 Manual Test Instructions Must Be Reproducible

Include all information necessary to reproduce the test.

Where applicable, specify:

- repository and branch;
- prerequisite build commands;
- environment variables;
- launch command;
- exact fixture/project;
- exact command or UI action;
- expected visible state;
- expected Problems entries;
- expected Output messages;
- expected notifications;
- expected process lifecycle;
- shutdown verification.

Do not assume knowledge from the development conversation.

### 28.22 Document Development-Only Configuration

If a feature currently requires development configuration, document:

- configuration name;
- environment variable name;
- expected value;
- precedence;
- example setup where useful;
- known production replacement plan.

Do not hide required configuration solely inside source code.

### 28.23 Do Not Document Developer-Specific Absolute Paths as Permanent Configuration

Examples may use placeholders such as:

```text
/path/to/threejs-java/...
```

or derive paths from documented repository locations.

Do not make one developer's absolute checkout path appear to be part of the product architecture.

A manual test instruction for the current development workspace may provide an exact command when needed, but distinguish it clearly from permanent configuration.

### 28.24 Keep User-Facing Terminology Consistent

Documentation, command titles, Output messages, notifications, and view labels should use consistent terminology.

Prefer established names such as:

```text
JScene3D
Project
Hierarchy
Inspector
Authoring Service
Play
Runtime
```

Do not introduce synonyms casually.

### 28.25 Comments Must Remain Accurate After Refactoring

When moving or changing code, review nearby comments.

A comment written for an earlier architecture may become misleading even if the code still compiles.

Remove obsolete comments rather than preserving them for historical interest.

### 28.26 Avoid Commented-Out Code

Do not leave old implementations commented out.

Delete obsolete code.

Version control preserves it if it is needed later.

### 28.27 Public Documentation Should Not Expose Internal Development Noise

User-facing documentation should not mention:

- temporary Codex workflows;
- internal test harness details;
- abandoned implementation attempts;
- irrelevant repository history.

Developer documentation may describe development configuration and architecture where necessary.

### 28.28 Documentation Is Part of Definition of Done

A change is not complete when it introduces or changes a documented contract but leaves the relevant documentation stale.

Review documentation impact as part of final verification rather than as optional follow-up.

## 29. Performance and Responsiveness

### 29.1 Keep the Extension Host Responsive

JScene3D TypeScript runs in the VS Code extension host and must not block it with expensive synchronous work.

Avoid long-running synchronous:

- filesystem operations;
- parsing;
- traversal;
- serialization;
- computation;
- process interaction.

Operations that may take meaningful time should use appropriate asynchronous APIs or remain in Java where Java owns the work.

### 29.2 Do Not Move Java Work into TypeScript for Performance Convenience

Do not duplicate Java-authoritative work in TypeScript merely to avoid a protocol request.

This includes:

- project parsing;
- definition resolution;
- hierarchy projection;
- schema interpretation;
- Inspector projection;
- domain validation.

If an operation is too slow across the process boundary, measure and improve the protocol or Java implementation rather than creating a second authority.

### 29.3 Measure Before Optimizing

Do not introduce caches, incremental update systems, batching, prefetching, or concurrency complexity based only on expected future performance.

First establish:

- the actual workload;
- the actual bottleneck;
- the user-visible impact.

Optimize demonstrated problems.

### 29.4 Prefer Coarse-Grained Protocol Operations

Cross-process calls have overhead.

Prefer operations that return a coherent useful result rather than requiring many small request/response round trips.

For example, a hierarchy snapshot is generally preferable to requesting every node individually.

Do not make responses excessively broad merely to minimize request count.

### 29.5 Avoid Chatty Inspector Protocols

An Inspector selection should not require separate protocol requests for every:

- component;
- property;
- constraint;
- value.

Prefer a target-scoped projection containing the coherent data needed to render the Inspector.

Mutations remain explicit operations.

### 29.6 Keep Payloads Purpose-Built

Do not send the entire project model merely because one view needs a small subset.

Large payloads increase:

- serialization cost;
- validation cost;
- memory usage;
- protocol coupling.

Design DTOs around actual client capabilities.

### 29.7 Respect Protocol Size Limits

Do not assume protocol payloads are unlimited.

Keep data within the agreed framing bounds.

If a future feature legitimately requires larger data, review:

- pagination;
- chunking;
- streaming;
- protocol limits;

rather than silently increasing limits without understanding the impact.

### 29.8 Avoid Repeated Serialization of Unchanged Large State

If profiling later shows large hierarchy or runtime snapshots becoming expensive, consider revision-aware or incremental mechanisms.

Do not implement them before there is evidence they are necessary.

Correctness and simplicity come first.

### 29.9 Do Not Poll Java for State

Prefer protocol notifications or explicit user-driven refresh where appropriate.

Do not repeatedly request:

```text
project state
hierarchy
Inspector
dirty state
runtime state
```

on a timer merely to detect changes.

Polling wastes CPU and process-boundary bandwidth and complicates lifecycle.

### 29.10 Do Not Poll VS Code State

Use VS Code events for:

- workspace changes;
- configuration changes;
- editor changes;
- selection changes;
- document changes.

Do not periodically inspect the editor to discover state changes.

### 29.11 Avoid Unnecessary View Refreshes

A view refresh may cause repeated tree queries and presentation work.

Do not refresh views because an unrelated state field changed.

Refresh when the data affecting that view changed.

For initial small views, full refresh is acceptable when simpler and fast enough.

### 29.12 Do Not Build Incremental Refresh Prematurely

Targeted hierarchy or Inspector updates may eventually improve performance.

Do not introduce complex diffing or patch application until:

- snapshot refresh is measurably inadequate;
- Java can identify authoritative changes reliably;
- the lifecycle semantics are understood.

### 29.13 Keep Event Handlers Lightweight

VS Code and application event handlers should perform small coordination or presentation updates.

Do not perform expensive synchronous traversal or transformation directly in frequently fired event handlers.

### 29.14 Debounce Only When the Semantics Permit It

Debouncing may be appropriate for high-frequency presentation-only operations.

Do not debounce authoritative operations such as:

- mutations;
- save;
- undo;
- redo;
- project close;

merely to reduce traffic.

If debouncing user input before a mutation is introduced, define clearly what value is authoritative and when the operation occurs.

### 29.15 Throttle High-Frequency Runtime Data Deliberately

Future runtime inspection may generate high-frequency updates.

Do not attempt to render every runtime change if the editor cannot meaningfully display them at that rate.

Define an explicit sampling, batching, or throttling policy when runtime inspection is implemented.

Do not apply such a policy to authored state without a separate requirement.

### 29.16 Avoid Unbounded Queues

Do not allow:

- pending requests;
- protocol notifications;
- log messages;
- runtime updates;
- refresh requests;

to accumulate without bounds.

Where a high-frequency source exists, define backpressure, replacement, batching, or dropping semantics appropriate to that data.

### 29.17 Pending Requests Must Have Clear Lifetime

The JSON-RPC client must remove requests from its pending map when they:

- succeed;
- fail;
- are rejected by transport failure;
- are otherwise terminated by the defined lifecycle.

Do not leak pending request state.

### 29.18 Avoid Large Copies Without Need

Treat large arrays and snapshots as immutable, but do not repeatedly copy them merely to satisfy stylistic immutability.

Use ownership and readonly contracts intelligently.

If performance becomes relevant, optimize with evidence while preserving safe ownership.

### 29.19 Avoid Expensive Derived State on Every Render

If a view repeatedly performs the same expensive transformation of an unchanged authoritative snapshot, consider deriving the presentation model once per snapshot.

Do not cache trivial calculations.

Any cache must have a clear invalidation rule.

### 29.20 Caches Must Have an Owner

Do not introduce global caches.

A cache must define:

- what it stores;
- who owns it;
- what authoritative state it derives from;
- when it is invalidated;
- its lifecycle.

A cache without a clear invalidation rule is incorrect state.

### 29.21 Prefer Bounded Caches

If caching potentially unbounded data becomes necessary, define a size or lifecycle bound.

Do not retain every project, hierarchy, Inspector target, or runtime object ever observed during the extension lifetime.

### 29.22 Project Close Must Release Project-Scoped Memory

Closing a project should release references to project-scoped:

- summaries;
- hierarchy snapshots;
- Inspector projections;
- diagnostics;
- subscriptions;
- caches;
- pending operation state where applicable.

Do not retain old project graphs accidentally through event listeners.

### 29.23 Service Failure Must Release Connection-Scoped Memory

When the Java process or transport fails:

- clear pending requests;
- release stream listeners;
- invalidate connection-scoped protocol state;
- release project state dependent on that connection.

Do not retain failed transport objects for later reuse.

### 29.24 Logging Must Not Become a Performance Problem

Do not emit high-frequency logs for:

- every protocol frame;
- every hierarchy node;
- every Inspector property;
- every runtime update;
- every event callback.

Operational logging should remain useful rather than becoming a data stream.

### 29.25 Runtime Validation Should Be Proportionate

Runtime validation is required at trust boundaries.

Keep validators straightforward and efficient.

Do not repeatedly validate the same already-validated DTO throughout the application.

Validate once at the boundary and use the typed result.

### 29.26 Avoid Premature Worker Threads

Do not introduce Node worker threads or additional helper processes for TypeScript computation without demonstrated need.

The Java service already exists for substantial JScene3D authoring work.

Additional concurrency infrastructure carries lifecycle and packaging cost.

### 29.27 Avoid Premature Lazy Loading

Do not make every module dynamically imported in an attempt to optimize extension startup.

Use lazy loading where:

- startup cost is measurable;
- the feature is genuinely optional or expensive;
- Code OSS conventions support it cleanly.

Ordinary static imports are preferable when the cost is negligible.

### 29.28 Keep Activation Fast

Extension activation should primarily register and wire components.

Do not:

- start Java unnecessarily;
- scan project directories;
- parse project files;
- build hierarchy state;
- preload Inspector data;

during activation unless the current lifecycle explicitly requires it.

### 29.29 User-Initiated Long Operations Need Feedback

If a user-triggered operation becomes perceptibly long, provide appropriate native VS Code progress feedback.

Do not add progress UI to operations that complete quickly.

Do not fake progress percentages when the underlying operation does not provide meaningful progress.

### 29.30 Cancellation Must Not Be Added Solely for Perceived Performance

Cancellation is a semantic capability, not a cosmetic performance feature.

Add it when the operation can safely define what cancellation means.

Do not add a Cancel button if Java will continue changing authoritative state with no defined reconciliation.

### 29.31 Optimize Startup Separately from Steady-State Work

Do not compromise steady-state architecture solely to reduce a small one-time startup cost.

Measure separately:

- extension activation;
- Java service startup;
- protocol initialization;
- project open;
- hierarchy load;
- Inspector interaction.

Different phases may require different solutions.

### 29.32 Realistic Fixtures Should Be Used for Performance Investigation

Small fixtures are best for correctness tests.

When investigating performance, also use representative larger projects so optimization decisions reflect realistic workloads.

Do not turn performance smoke tests into fragile hard timing gates without a deliberate benchmarking strategy.

### 29.33 Avoid Hard Performance Assertions in Ordinary Unit Tests

Do not write tests such as:

```text
must complete in less than 50 ms
```

unless the repository has a controlled performance-test environment and the threshold represents a real contract.

Ordinary CI timing is too variable for arbitrary micro-performance assertions.

### 29.34 Performance Changes Must Preserve Correctness

An optimization must not weaken:

- runtime validation;
- stale-result checks;
- generation/revision checks;
- resource disposal;
- diagnostic correctness;
- Java authority.

Do not trade architectural correctness for speculative responsiveness.

### 29.35 Profile the Correct Process

JScene3D spans:

```text
Code OSS UI/workbench
extension host
Java authoring service
future runtime process
Electron/native rendering
```

When investigating a performance issue, determine which process actually owns the cost.

Do not optimize TypeScript because an operation appears slow if the time is actually spent in Java or process startup.

### 29.36 Performance Work Requires Evidence

When a task is specifically intended to improve performance, record:

- observed problem;
- measurement method;
- baseline;
- change;
- resulting measurement;
- any trade-offs.

Do not describe an optimization as successful solely because the code appears more efficient.

## 30. Security and Trust Boundaries

### 30.1 Treat Process Boundaries as Trust Boundaries

Data crossing between Code OSS and another process must be validated before it affects application state.

This includes communication with:

- the Java authoring service;
- the future Play/runtime process;
- native or Electron integration where applicable.

Do not treat another JScene3D process as equivalent to trusted in-process TypeScript code.

### 30.2 Safe Authoring Must Not Execute Project Code

Opening, inspecting, or editing a JScene3D project must not execute project application code, game logic, runtime extensions, or other executable project-controlled behavior.

Safe authoring and runtime execution are separate architectural capabilities.

Do not weaken this boundary for convenience.

### 30.3 Project Open Is Data Loading, Not Execution

`project/open` may:

- read project metadata;
- load definitions;
- read published import data;
- validate descriptors;
- discover assets;
- construct safe authoring state.

It must not implicitly start the game runtime.

TypeScript must not introduce execution as a side effect of opening a project.

### 30.4 Runtime Execution Requires an Explicit User Action

Future Play/runtime execution must begin through an explicit runtime operation.

Do not automatically execute a project because:

- the workspace opened;
- a `.j3d` descriptor was selected;
- the authoring service started;
- the Hierarchy was displayed.

Authoring and execution require separate lifecycle transitions.

### 30.5 Integrate with Workspace Trust Where Execution Requires It

When JScene3D begins executing project-controlled code or other potentially unsafe runtime behavior, integrate with the relevant VS Code workspace trust mechanisms.

Do not assume that because a project can be safely inspected it is also trusted for execution.

The exact trust policy must be defined as part of the runtime/Play implementation.

### 30.6 Do Not Gate Safe Inspection Unnecessarily

Do not require runtime execution trust merely to perform operations that are deliberately designed to be safe authoring operations.

The architecture should preserve the ability to inspect and diagnose projects without executing them where practical.

### 30.7 Validate Protocol Input

All protocol messages from Java must pass:

- framing validation;
- JSON parsing;
- JSON-RPC envelope validation;
- method-specific DTO validation.

Do not apply malformed or unexpected data to TypeScript state.

### 30.8 Bound Protocol Input

Enforce the agreed limits for protocol:

- header size;
- payload size.

Do not buffer unbounded data from child-process streams.

A malformed process must not be able to cause unlimited memory growth through framing input.

### 30.9 Do Not Evaluate Protocol Data

Protocol payloads are data.

Never process protocol strings through mechanisms such as:

```text
eval
Function
dynamic code generation
shell evaluation
```

Parse JSON and validate it structurally.

### 30.10 Do Not Construct Shell Commands from Project Data

Prefer direct process execution with argument arrays.

Do not concatenate:

- project paths;
- descriptor values;
- project settings;
- user input;

into shell command strings.

If a future tool genuinely requires shell execution, its quoting and trust model require explicit review.

### 30.11 Treat Paths as Data

Project and descriptor paths may contain:

- spaces;
- Unicode;
- shell metacharacters;
- unusual but valid filesystem characters.

Pass them as process arguments or filesystem values, not interpolated shell syntax.

Do not impose arbitrary filename restrictions that do not exist in the Java project contract.

### 30.12 Java Owns Project-Root Confinement Rules

Do not duplicate Java's project descriptor and project-root security checks in TypeScript as authoritative validation.

Java already owns rules such as descriptor discovery and confinement.

TypeScript may enforce its own editor/process safety requirements where appropriate, but must not create a divergent project-validity model.

### 30.13 Do Not Trust Descriptor File Extensions as Validation

Selecting a `.j3d` file through a filtered picker does not prove that the file contains a valid JScene3D project descriptor.

Send it to Java for authoritative validation.

File-picker filters improve user experience; they are not a security or validation boundary.

### 30.14 Do Not Follow Project Instructions Implicitly

Project data must not cause TypeScript to automatically:

- execute commands;
- launch arbitrary executables;
- install extensions;
- open external URLs;
- modify unrelated workspace files;
- change editor security settings.

Such actions require an explicitly designed capability and appropriate user control.

### 30.15 Process Executables Must Come from Controlled Configuration

Development Java executable and module-path configuration must come from the defined launch configuration mechanisms.

Do not allow project files to specify the Java executable used to launch the authoring service.

The only current editor-development launch path is the Code OSS
`scripts/jscene3d/launch-source-editor.sh` launcher with the downstream
JScene3D Electron development executable. On macOS, the authoritative
development application identity is `JScene3D Editor Dev` with bundle
identifier `com.jscene3d.editor.dev`. Launch and automation code must use that
exact executable or bundle identifier, never a generic or display-name lookup
for `JScene3D`, `JScene3D Editor`, or `Electron`. Visual/editor acceptance must
attach only to `com.jscene3d.editor.dev`. If that exact application cannot be
controlled, visual automation must stop; it must never fall back to the stock
Code OSS source bundle `com.jscene3d.editor`, the retired standalone Java
editor `io.github.glynch.jscene3d.editor`, or another similarly named
application.

Production packaging must eventually provide a controlled JScene3D runtime/service distribution.

### 30.16 Do Not Trust Environment Variables Without Validation

Development environment variables are external configuration.

Validate them before use.

Do not execute arbitrary environment-provided strings as shell commands.

Environment configuration should identify expected values such as an executable or module path.

### 30.17 Keep Development Launch Configuration Out of Projects

Do not store developer-specific authoring-service launch paths inside `.j3d` project descriptors or project settings.

Project files should remain portable and must not gain control over editor infrastructure merely to support local development.

### 30.18 Avoid Broad Filesystem Access

TypeScript should access only filesystem locations required by the feature.

Do not recursively scan unrelated user directories or workspace locations without a defined requirement.

Where Java already owns project discovery or asset scanning, do not duplicate that traversal in TypeScript.

### 30.19 Respect the Workspace Boundary

Code OSS workspace state provides important user context.

Do not modify files outside the intended JScene3D project/workspace merely because an absolute path is available from project data.

Operations that intentionally target external resources require explicit design and user expectations.

### 30.20 Do Not Write JScene3D Domain Files Directly from TypeScript

Authoritative JScene3D mutations and persistence belong to Java.

TypeScript must not bypass Java validation by directly rewriting domain files for:

- Inspector edits;
- hierarchy mutations;
- project settings;
- save/revert;
- undo/redo.

Ordinary text-document editing remains governed by normal VS Code behavior where applicable.

### 30.21 Validate Semantic Targets in Java

TypeScript may send semantic identities supplied by Java back to the authoring service.

Java must validate that a target:

- belongs to the active session;
- belongs to the expected authored state;
- is editable where required;
- satisfies revision/generation requirements.

Do not treat possession of an ID as authorization for arbitrary mutation.

### 30.22 Stale State Must Not Authorize Mutation

A stale hierarchy or Inspector target must not be accepted merely because TypeScript still holds it.

Use the protocol's generation and revision semantics to allow Java to reject stale operations.

Do not bypass stale-state failures by automatically substituting current authority.

### 30.23 Do Not Trust UI State as Authority

VS Code selection, context keys, visible views, and command enablement are presentation state.

They do not prove that a Java operation is valid.

Java validates authoritative operation semantics even when the UI attempted to prevent invalid actions.

### 30.24 Keep Authoring and Runtime Permissions Separate

Future runtime execution may require permissions or trust beyond those needed for safe authoring.

Do not let successful authoring-service initialization imply authorization to execute the project.

Runtime startup must perform its own required checks.

### 30.25 Native Integration Requires Explicit Review

Electron, IOSurface, Mach-port transfer, native libraries, and other platform-specific integrations cross stronger security and stability boundaries than ordinary TypeScript.

Do not add native integration to the built-in extension casually.

Keep it behind the architecture defined for Electron/runtime ownership.

### 30.26 Do Not Load Arbitrary Native Libraries from Project Paths

Native libraries used by the JScene3D editor/runtime infrastructure must come from controlled product/runtime packaging.

Do not allow a project descriptor to point the editor at an arbitrary native library and load it into the editor process.

Any future project-native-extension mechanism requires a separate explicit security design.

### 30.27 Keep Secrets Out of Logs

Do not log:

- credentials;
- authentication tokens;
- private keys;
- complete environment contents;
- secret configuration values.

If future integrations require credentials, use the appropriate VS Code secure-storage mechanisms rather than ordinary settings or Output.

### 30.28 Avoid Logging Unnecessary Project Content

Operational logs should identify operations and failures without dumping arbitrary project file contents.

Do not log complete:

- descriptors;
- source files;
- protocol payloads;
- component data;

by default.

### 30.29 Treat External URLs Deliberately

If a future JScene3D feature opens an external URL, use the appropriate VS Code API and ensure the URL comes from a trusted or user-understood source.

Do not automatically open URLs merely because project metadata contains them.

### 30.30 Do Not Automatically Install Dependencies from Projects

Opening a JScene3D project must not automatically:

- run package managers;
- download executable dependencies;
- install extensions;
- execute build scripts.

Any future dependency-resolution workflow requires explicit design, trust handling, and user visibility.

### 30.31 Imported Data Is Still Data

Published/imported JScene3D project content used by safe authoring must remain non-executable during authoring project load.

Do not turn import discovery into runtime provider execution from TypeScript.

The Java safe-authoring boundary remains authoritative for this behavior.

### 30.32 Error Handling Must Not Expose Sensitive Internals Unnecessarily

Technical failures may be recorded in Output where useful for troubleshooting.

User notifications should not expose:

- raw environment values;
- unnecessary command lines;
- secrets;
- large raw payloads.

Provide enough information to diagnose the problem without indiscriminate disclosure.

### 30.33 Tests Must Include Trust-Boundary Failures

Where relevant, automated tests should cover:

- malformed protocol data;
- oversized framing input;
- invalid DTOs;
- unexpected process output;
- invalid configured executable/module path;
- stale mutation targets;
- unsupported protocol versions.

Do not rely only on valid trusted inputs.

### 30.34 Security Checks Must Not Be Disabled for Tests

Do not weaken production validation or trust checks merely to make fixtures easier to construct.

Tests should produce valid inputs or explicitly verify rejection of invalid inputs.

### 30.35 Security-Sensitive Changes Require Manual Verification Where Appropriate

When a feature changes:

- process launch;
- workspace trust;
- runtime execution;
- filesystem mutation;
- native integration;

manual test instructions must include the relevant security/lifecycle behavior.

For example, a future Play implementation should verify that safe project opening does not itself execute project code and that runtime execution occurs only through the explicit Play workflow.

### 30.36 Prefer Secure Architecture Over Defensive Patches

Security should primarily come from clear boundaries:

```text
safe authoring
    separate from runtime execution

TypeScript presentation
    separate from Java domain authority

protocol data
    validated at process boundary

native integration
    isolated from ordinary extension code
```

Do not rely on scattered input checks to compensate for an architecture that unnecessarily mixes trust domains.

## 31. Legacy Code and Compatibility

### 31.1 Do Not Preserve Legacy Code Without a Requirement

Backward compatibility is a requirement only when explicitly established.

Do not retain obsolete:

- APIs;
- abstractions;
- adapters;
- compatibility layers;
- configuration;
- tests;
- modules;

merely because they already exist.

Version control preserves history.

### 31.2 The JavaFX Editor Is Not a Compatibility Target

The legacy JavaFX JScene3D editor does not define the architecture of the Code OSS editor.

The standalone Java editor is retired. Editor development, automated testing,
screenshots, and manual acceptance must use the Code OSS JScene3D Editor through
`scripts/jscene3d/launch-source-editor.sh` and the downstream JScene3D Electron
development executable. The current editor Project format is `*.j3d`; a process
looking for the legacy `jscene3d.json` workflow indicates that the wrong product
was selected and must not be treated as a request to rebuild the current Java
runtime.

Do not reproduce its:

- workbench abstractions;
- editor extension system;
- global selection model;
- view models;
- property-editor callbacks;
- command infrastructure;
- menu infrastructure;
- status-bar infrastructure;
- configuration abstractions;

in TypeScript merely to preserve conceptual compatibility.

### 31.3 `jscene3d-editor-api` Is Not a TypeScript Design Reference

The legacy Java `jscene3d-editor-api` module was designed for the previous editor architecture.

Do not mirror its interfaces or package structure in TypeScript.

Where both systems require a similar capability, design the Code OSS implementation around:

- current JScene3D domain requirements;
- the Java authoring-service boundary;
- native VS Code APIs.

Similarity of terminology does not imply compatibility is required.

### 31.4 Preserve Domain Semantics, Not Legacy Editor APIs

Some concepts used by the old editor remain valid because they represent genuine JScene3D authoring behavior.

Examples include:

- working-copy semantics;
- dirty state;
- save and revert;
- undo and redo;
- hierarchy projection;
- Inspector projection;
- diagnostics.

Preserve those semantics through the permanent Java authoring architecture.

Do not preserve the old editor-specific interfaces that previously exposed them.

### 31.5 Prefer Removal Over Compatibility Adapters for Retired Code

Do not create adapters solely to keep retired or unused internal code compiling.

An adapter is justified when two supported architectures genuinely need to coexist.

It is not justified merely because obsolete code still references an old contract.

### 31.6 Compatibility Has a Maintenance Cost

Every compatibility layer adds:

- code;
- tests;
- lifecycle complexity;
- additional contracts;
- architectural constraints;
- future removal work.

Require a concrete consumer or migration requirement before accepting that cost.

### 31.7 Internal APIs May Change When Architecture Requires It

JScene3D internal TypeScript APIs may be changed when doing so improves the permanent architecture and no supported compatibility requirement prevents it.

Do not preserve a poor internal API solely to minimize changes to internal callers.

Update the callers.

### 31.8 Protocol Compatibility Is Different

The Java ↔ TypeScript protocol is an explicit versioned cross-process contract.

Do not apply the same casual compatibility policy used for internal TypeScript refactoring.

Protocol changes must follow the documented versioning and compatibility rules.

### 31.9 Persisted Data Requires Compatibility Consideration

Even an internal TypeScript representation may become a compatibility concern if it is persisted across application versions.

Before changing persisted extension/workspace state, determine:

- whether existing persisted values may still exist;
- whether migration is required;
- whether old values can safely be discarded.

Do not assume TypeScript type changes automatically migrate persisted runtime data.

### 31.10 Command IDs May Become Compatibility Contracts

Command identifiers may be referenced by:

- `package.json`;
- menus;
- keybindings;
- tests;
- documentation;
- user configuration.

Do not rename established command IDs casually.

A command implementation may change while its semantic identifier remains stable.

### 31.11 View IDs Are Stable Integration Contracts

View and view-container IDs may be referenced by Code OSS contribution configuration and persisted editor state.

Do not rename them merely for stylistic consistency.

Rename only when the semantic identity genuinely changes and the migration impact is understood.

### 31.12 Context Keys Are Internal but Shared

Context keys are shared contracts between TypeScript state and declarative Code OSS contributions.

Changing them requires updating all consumers.

Do not treat them as arbitrary local variable names.

### 31.13 Development Configuration May Be Temporary

Development-only configuration such as:

```text
jscene3d.authoring.javaExecutable
jscene3d.authoring.modulePath
```

may exist solely until production Java packaging and discovery are implemented.

Keep such configuration isolated so it can be removed cleanly.

Do not build permanent architecture around temporary development configuration.

### 31.14 Mark Temporary Architecture Clearly

When temporary infrastructure is necessary, document:

- why it exists;
- what permanent mechanism will replace it;
- which code boundary isolates it.

Do not use names such as `TemporaryService` throughout permanent code.

The implementation can have a permanent abstraction with a temporary development implementation.

### 31.15 Do Not Preserve POC Behavior Automatically

A behavior implemented during a POC milestone does not become a permanent requirement merely because it works.

When later architecture reveals a better ownership or lifecycle model, change the POC implementation.

Examples include:

- development process discovery;
- project/workspace lifecycle;
- temporary Project view presentation;
- fallback diagnostic ranges.

### 31.16 Avoid Throwaway Code Where the Permanent Boundary Is Known

When the intended permanent architecture is already clear, implement against that boundary even if the first feature is small.

For example, the first Project view may be visually minimal while still using:

- the permanent protocol client;
- permanent project-state ownership;
- native diagnostics;
- permanent process supervision.

Do not build a temporary monolithic implementation merely because the UI milestone is small.

### 31.17 Do Not Overbuild for Future Compatibility

Avoid abstractions intended to support hypothetical future:

- alternate editors;
- alternate protocols;
- alternate Java implementations;
- multiple simultaneous project sessions;
- plugin APIs;

unless those are actual requirements.

Future flexibility should come from clear boundaries, not speculative frameworks.

### 31.18 Remove Obsolete Code Promptly

Once code has no supported consumer and no near-term migration purpose, remove it.

Do not allow obsolete implementations to remain indefinitely because deleting them feels risky.

Before removal, verify actual consumers and repository dependencies.

### 31.19 Audit Before Large Legacy Removal

Before deleting a substantial legacy module or subsystem, perform a focused dependency/consumer audit when ownership is not already obvious.

Determine:

- production consumers;
- test consumers;
- build dependencies;
- useful functionality that may still belong in the permanent architecture.

Do not delete by module name alone.

### 31.20 Do Not Modernize Retired Code for Its Own Sake

Do not spend time:

- fixing style;
- adding tests;
- adapting APIs;
- improving architecture;

inside code that is expected to be removed unless that work is required for the migration.

Engineering effort should go toward the permanent architecture.

### 31.21 Tests for Retired Behavior May Be Removed

When an obsolete behavior is intentionally removed, remove tests whose only purpose was enforcing that behavior.

Do not keep compatibility tests that force the new architecture to preserve a retired contract.

Retain or rewrite tests that verify underlying domain behavior still required by the permanent system.

### 31.22 Do Not Use Legacy Tests as Architecture Authority

An existing test proves that a behavior was previously expected.

It does not automatically prove that behavior remains a requirement.

When architecture deliberately changes, review whether the test should:

- remain;
- be rewritten;
- move to another owner;
- be removed.

### 31.23 Keep Migration Work Separate Where Practical

When removing substantial legacy architecture, prefer focused changes that clearly distinguish:

```text
permanent replacement
legacy removal
```

This makes review easier and prevents accidental loss of still-required behavior.

Do not create artificial separation when both changes must occur atomically for correctness.

### 31.24 Compatibility Decisions Must Be Explicit

When a task encounters legacy behavior that conflicts with the permanent architecture, do not silently preserve it.

Determine whether compatibility is actually required.

If the answer affects architecture or significant implementation scope, stop and request a decision rather than creating a compatibility layer automatically.

### 31.25 Do Not Let a Green Build Dictate Architecture

A full repository build may fail because intentionally retired code depends on removed APIs.

Do not recreate obsolete APIs solely to make the build green.

Instead determine whether the correct action is to:

- remove the legacy consumer;
- remove the legacy module from the reactor/build;
- update a still-supported consumer;
- explicitly defer the cleanup.

Quality gates validate the intended architecture; they do not define which obsolete architecture must remain.

### 31.26 Restore Full Verification After Legacy Removal

Once the decision to retire legacy code is made, update the repository/build so the normal full verification path represents the supported codebase again.

Do not leave the repository permanently dependent on partial verification because obsolete modules remain broken.

### 31.27 Document Intentional Compatibility Breaks

When removing an internal contract that affects substantial existing code, record:

- what was removed;
- why it is no longer supported;
- what permanent capability replaces it where applicable;
- what legacy code remains to be removed.

Do not describe an intentional architectural break as an accidental regression.

### 31.28 Manual Testing Targets Supported Behavior

Manual test instructions should exercise the permanent Code OSS implementation.

Do not require the developer to launch or verify the legacy JavaFX editor unless a task explicitly concerns legacy migration.

The supported editor behavior is the Code OSS JScene3D experience.

## 32. Definition of Done

A JScene3D TypeScript change is complete only when the implemented behavior, architecture, tests, quality checks, documentation, and manual verification appropriate to the change are complete.

### 32.1 The Requested Scope Is Complete

Implement the agreed scope fully.

Do not report a task complete when:

- required behavior remains stubbed;
- known required paths are unimplemented;
- temporary hard-coded behavior substitutes for the requested implementation;
- tests were added without completing the production behavior.

Do not expand the task into unrelated improvements merely because they are nearby.

### 32.2 Architectural Boundaries Are Preserved

Before completion, verify that the implementation still respects the permanent architecture.

In particular:

```text
Code OSS / TypeScript
    owns editor integration and presentation

Java authoring service
    owns JScene3D authoring semantics and state

Java runtime process
    owns future executable runtime state

Electron/native integration
    owns platform-specific rendering integration
```

Do not accept an implementation merely because it works if it violates these ownership boundaries.

### 32.3 Java Authority Is Preserved

TypeScript must not independently become authoritative for:

- project validation;
- descriptor semantics;
- hierarchy semantics;
- Inspector semantics;
- mutation validation;
- authoring revision;
- dirty state;
- save or revert;
- undo or redo.

If a feature requires Java-authoritative information that the protocol does not provide, extend the appropriate contract rather than reconstructing the answer in TypeScript.

### 32.4 Native VS Code APIs Are Used Where Appropriate

Before introducing or retaining custom infrastructure, verify that the requirement is not already satisfied by a native VS Code API.

Prefer native mechanisms for:

- commands;
- context keys;
- workspace lifecycle;
- views;
- diagnostics;
- Output;
- notifications;
- progress;
- configuration;
- cancellation;
- disposal.

Custom infrastructure requires a concrete reason.

### 32.5 State Ownership Is Clear

Every new mutable state value must have one identifiable owner.

Before completion, verify that:

- views are not authoritative state stores;
- protocol clients do not own project presentation state;
- context keys are not used as application authority;
- Java-derived state is not independently mutated in TypeScript;
- project-scoped state is invalidated with its owning project session.

### 32.6 Lifecycle Is Complete

Any new long-lived resource must have a complete lifecycle.

Verify as applicable:

```text
creation
normal operation
failure
replacement
project close
service failure
extension disposal
```

Resources must not depend on process exit or garbage collection for normal cleanup.

### 32.7 Asynchronous Races Are Considered

For asynchronous features, identify realistic stale-result and concurrency scenarios.

Add protection and tests where relevant.

Examples include:

```text
close while open is pending
new selection before old Inspector response
service exit during request
extension disposal during operation
stale generation
stale revision
```

Do not assume promise completion order provides correctness.

### 32.8 External Data Is Runtime-Validated

Any new external data crossing into TypeScript must be validated at the trust boundary.

This includes new:

- protocol DTOs;
- notifications;
- persisted state;
- development configuration;
- environment configuration.

Do not use type assertions as runtime validation.

### 32.9 Error Behavior Is Defined

For every meaningful failure path, determine:

- resulting application state;
- whether structured diagnostics exist;
- what belongs in Problems;
- what belongs in JScene3D Output;
- whether a user notification is appropriate;
- what cleanup occurs.

Do not leave error behavior as an accidental consequence of thrown exceptions.

### 32.10 Tests Cover Meaningful Behavior

Add or update tests for the behavior introduced or changed.

Tests should cover as appropriate:

- successful behavior;
- failure behavior;
- state transitions;
- lifecycle;
- stale results;
- concurrency;
- cleanup;
- runtime validation;
- presentation mapping;
- cross-language contracts.

Do not add tests solely to increase coverage.

### 32.11 Cross-Language Changes Are Verified on Both Sides

A Java ↔ TypeScript protocol change is incomplete until both sides agree on the contract.

Verify as applicable:

- Java DTO/service behavior;
- TypeScript DTO;
- runtime validation;
- protocol capability/version implications;
- canonical fixtures or equivalent contract protection;
- real-process integration.

Do not knowingly leave one repository expecting a different contract from the other.

### 32.12 TypeScript Compilation Passes

Run the appropriate TypeScript compilation for the changed JScene3D surface.

The result must pass without errors introduced by the change.

Do not weaken compiler configuration to achieve success.

### 32.13 ESLint Passes

Run ESLint against the changed JScene3D TypeScript.

Resolve violations rather than suppressing them without justification.

Report the actual scope checked.

### 32.14 Automated Tests Pass

Run the focused automated tests relevant to the changed behavior.

Report:

- test command;
- test scope;
- number of tests where available;
- result.

Run broader tests when required by the affected Code OSS area or the risk of the change.

Do not claim a suite passed if it was not run.

### 32.15 `git diff --check` Passes

Run:

```text
git diff --check
```

before completion.

Correct whitespace errors before reporting the task ready for review.

### 32.16 Review the Complete Diff

Inspect the final working-tree diff.

Confirm that it contains no:

- unrelated changes;
- accidental generated files;
- developer-specific hard-coded paths;
- temporary debugging output;
- commented-out code;
- test-only production hooks;
- unexplained quality-rule suppressions.

### 32.17 Documentation Is Current

Update documentation affected by the change.

Document new or changed:

- architecture;
- protocol contracts;
- development configuration;
- lifecycle behavior;
- temporary limitations;
- manual testing requirements.

Do not leave documentation knowingly inconsistent with implementation.

### 32.18 Known Limitations Are Explicit

If a limitation is intentionally deferred, record it clearly.

A limitation must not be hidden behind apparently complete behavior.

Examples include:

- development-only Java discovery;
- fallback diagnostic ranges;
- no crash recovery;
- deferred protocol capability;
- temporary workspace behavior.

### 32.19 No Unrequested Commit Is Created

Codex must not commit changes unless the task explicitly requests a commit.

Final output should state the Git status and whether anything is staged or committed when requested by the task.

### 32.20 User-Visible Work Requires Manual Test Instructions

Any task producing behavior the developer can manually exercise must provide a dedicated:

```text
Manual Test Instructions
```

section in its final output.

This is required even when Codex has already performed manual testing.

### 32.21 Manual Test Instructions Are Developer-Facing

The instructions must allow the developer to reproduce the behavior independently.

Include as applicable:

1. repository and branch;
2. prerequisite build commands;
3. required environment variables or settings;
4. exact POC launch command;
5. exact command-palette command or UI action;
6. exact fixture/project to use;
7. expected Explorer/workspace state;
8. expected Project, Hierarchy, or Inspector state;
9. expected Problems entries;
10. expected JScene3D Output messages;
11. expected notifications;
12. expected Java process lifecycle;
13. project-close behavior;
14. application-shutdown behavior.

Do not merely state that manual testing was performed successfully.

### 32.22 Manual Instructions Include Relevant Failure Cases

When a feature has meaningful failure behavior, provide at least one representative failure scenario.

For example, project-open work should normally include:

```text
valid project
malformed project
semantically invalid project
```

State the expected behavior for each.

### 32.23 Manual Verification Uses the Correct POC

Manual testing must use the intended Code OSS JScene3D POC environment.

Do not test against an installed application or the retired standalone Java
editor. Before interacting with a macOS editor window, verify the exact
`com.jscene3d.editor.dev` bundle identifier and retain the launcher's executable
and isolated-profile paths for process inspection and shutdown. Display names
are not sufficient identity evidence.

Where isolated user-data or extension directories are part of the established workflow, include them in the instructions.

### 32.24 Process-Lifecycle Changes Require Process Verification

When a task starts, stops, restarts, or otherwise changes Java process lifecycle, manual instructions must include process verification.

For example:

```text
Close Project
    → Java authoring service remains alive

Exit Code OSS
    → Java authoring service exits
```

Do not consider lifecycle work manually verified solely because the UI appears correct.

### 32.25 Verification Results Are Reported Precisely

Final implementation reports should state exactly what was verified.

Prefer:

```text
TypeScript compilation: passed
ESLint: 18 files checked, passed
Focused Mocha: 31 tests passed
Real Java subprocess integration: passed
git diff --check: passed
```

over:

```text
All tests passed.
```

If a broad Code OSS suite was not run, state that explicitly.

### 32.26 Pre-Existing Failures Are Distinguished

If a broader verification command fails:

1. determine whether the current work caused the failure;
2. identify the exact failing area;
3. run the authoritative focused checks for the changed surface;
4. report the limitation.

Do not silently ignore failures.

Do not modify unrelated code solely to make a broad command green without authorization.

### 32.27 Temporary Development Mechanisms Remain Isolated

Before completion, verify that temporary POC mechanisms have not spread into permanent architecture.

Examples include:

- local Java module-path configuration;
- fixture locations;
- development launch paths;
- temporary protocol limitations.

A future production implementation should be able to replace the temporary mechanism at its intended boundary.

### 32.28 No New Framework Is Introduced Without Need

Review any new abstraction, dependency, registry, event system, state framework, validation framework, or service layer.

It must solve a demonstrated problem.

Do not accept infrastructure created primarily for hypothetical future use.

### 32.29 Supported Code Remains Buildable

The normal verification path should represent the supported Code OSS JScene3D implementation.

Do not preserve obsolete architecture solely to keep retired code compiling.

Conversely, do not knowingly leave supported code broken and rely permanently on partial verification.

### 32.30 The Change Is Ready for Review, Not Merely Finished Generating

Before reporting completion, Codex must review its own final implementation against:

- these TypeScript coding standards;
- the integration development standards;
- the task requirements;
- the final diff;
- the verification results.

The completion criterion is that the change is ready for developer review and manual testing, not merely that code generation has stopped.
