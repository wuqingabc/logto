# Pre-patch-stack history

The former fork is superseded by the wrapper + upstream submodule + patch series architecture. It must not be merged as the current root tree.

Verified on 2026-11-02: applying migration commit `0b1b1166b` patches 0001–0009 to upstream `69d3eb6bdaa6dd18c313da8a94487da294c1d9d4` in a separate Git index produced tree `616228675d6ea072051b0beccc54786a594b570e`, identical to old fork commit `866a119f70920b1b1cebf900dce768251d9bd5e2`. No old fork content was lost in the migration. Later wrapper patches and upgrades remain authoritative.

The complete 8,262-commit history remains available through annotated tag `archive/pre-patch-stack-20261102`; an independently verified complete Git bundle is held in the local branch-cleanup audit directory. The obsolete branch name can therefore be removed without destroying history. This archival operation changes no running service or upstream working directory.
