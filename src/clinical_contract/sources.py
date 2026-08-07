"""Resolve one CSV or Parquet source for each contract schema."""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from collections import Counter
from pathlib import Path
from typing import TypeAlias

from .models import SchemaItem


DataSource: TypeAlias = str | os.PathLike[str] | bytes | bytearray
DataSources: TypeAlias = DataSource | Sequence[DataSource] | Mapping[str, DataSource]


def data_source_name(source: DataSource) -> str:
    """Return a user-facing source name without inspecting its contents."""
    if isinstance(source, (bytes, bytearray)):
        return "in-memory data"
    return Path(os.fspath(source)).name


def _schema_names(schemas: Sequence[SchemaItem]) -> list[str]:
    names = [schema.name for schema in schemas]
    normalized_counts = Counter(name.casefold() for name in names)
    duplicates = sorted(
        name for name in names if normalized_counts[name.casefold()] > 1
    )
    if duplicates:
        raise ValueError(
            "Schema names must be unique to resolve data sources: "
            + ", ".join(duplicates)
        )
    return names


def resolve_schema_sources(
    schemas: Sequence[SchemaItem],
    sources: DataSources,
) -> dict[str, DataSource]:
    """Map schema names to sources while allowing schemas without a source."""
    schema_names = _schema_names(schemas)
    schema_name_set = set(schema_names)

    if isinstance(sources, Mapping):
        unknown = sorted(set(sources) - schema_name_set)
        if unknown:
            raise ValueError(
                "Data source mapping contains unknown schema name(s): "
                + ", ".join(unknown)
            )
        return {name: sources[name] for name in schema_names if name in sources}

    if isinstance(sources, (str, os.PathLike, bytes, bytearray)):
        source_list: list[DataSource] = [sources]
    elif isinstance(sources, Sequence):
        source_list = list(sources)
    else:
        raise TypeError(
            "Data sources must be a path, bytes, a sequence of paths, "
            "or a schema-to-source mapping."
        )

    if len(schema_names) == 1 and len(source_list) == 1:
        return {schema_names[0]: source_list[0]}

    resolved: dict[str, DataSource] = {}
    unmatched: list[str] = []
    for source in source_list:
        if isinstance(source, (bytes, bytearray)):
            raise ValueError(
                "In-memory data requires an explicit schema-to-source mapping "
                "when the contract contains multiple schemas."
            )

        source_path = Path(os.fspath(source))
        schema_name = source_path.stem
        if schema_name not in schema_name_set:
            unmatched.append(source_path.name)
            continue
        if schema_name in resolved:
            raise ValueError(
                f"Multiple data files resolve to schema '{schema_name}'. "
                "Each schema accepts exactly one file."
            )
        resolved[schema_name] = source

    if unmatched:
        raise ValueError(
            "No schema matches the following data file name(s): "
            + ", ".join(unmatched)
            + ". Rename each file to its schema name or use an explicit mapping."
        )
    return resolved
