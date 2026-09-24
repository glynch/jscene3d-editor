# Authoring protocol fixtures

These small canonical responses exercise the production TypeScript validators.
The real-process test separately checks the currently built Java service through
the same framing, JSON-RPC, and validation path.

Publishing shared Java-generated contract fixtures remains deferred. Until that
mechanism exists, the committed TypeScript fixtures and the required real Java
process test jointly protect the cross-language boundary.
