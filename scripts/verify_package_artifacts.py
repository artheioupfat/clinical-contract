#!/usr/bin/env python3
"""Fail a release build if its sdist or wheel omits the Python package."""
from __future__ import annotations

import argparse
import tarfile
import zipfile
from pathlib import Path


PACKAGE_MEMBERS = (
    "__init__.py",
    "cli.py",
    "contract.py",
    "loader.py",
    "models.py",
    "type_catalog.py",
    "py.typed",
)


def _single_artifact(dist_dir: Path, suffix: str) -> Path:
    artifacts = sorted(dist_dir.glob(f"clinical_contract-*{suffix}"))
    if len(artifacts) != 1:
        found = ", ".join(path.name for path in artifacts) or "none"
        raise RuntimeError(
            f"Expected exactly one {suffix} artifact in {dist_dir}, found: {found}."
        )
    return artifacts[0]


def _require_members(
    artifact: Path,
    members: set[str],
    expected: tuple[str, ...],
    prefix: str,
) -> None:
    missing = [
        f"{prefix}{filename}"
        for filename in expected
        if f"{prefix}{filename}" not in members
    ]
    if missing:
        raise RuntimeError(f"{artifact.name} is missing package files: {', '.join(missing)}")


def verify_sdist(artifact: Path) -> None:
    with tarfile.open(artifact, "r:gz") as archive:
        members = set(archive.getnames())

    missing = [
        filename
        for filename in PACKAGE_MEMBERS
        if not any(name.endswith(f"/src/clinical_contract/{filename}") for name in members)
    ]
    if missing:
        raise RuntimeError(f"{artifact.name} is missing sdist package files: {', '.join(missing)}")


def verify_wheel(artifact: Path) -> None:
    with zipfile.ZipFile(artifact) as archive:
        _require_members(
            artifact,
            set(archive.namelist()),
            PACKAGE_MEMBERS,
            "clinical_contract/",
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dist_dir", type=Path)
    args = parser.parse_args()

    sdist = _single_artifact(args.dist_dir, ".tar.gz")
    wheel = _single_artifact(args.dist_dir, ".whl")
    verify_sdist(sdist)
    verify_wheel(wheel)
    print(f"Verified package contents: {sdist.name}, {wheel.name}")


if __name__ == "__main__":
    main()
