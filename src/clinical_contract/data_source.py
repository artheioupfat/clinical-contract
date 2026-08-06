"""DuckDB-backed CSV and Parquet source handling."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import duckdb

from .sources import DataSource


def _quote_identifier(identifier: str) -> str:
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def _materialize_data_source(path_or_bytes: DataSource) -> tuple[str, str | None, str]:
    """
    Return (file_path, temp_path_to_cleanup, extension).
    Bytes are written to a temporary file with unknown extension (.bin)
    so parquet/csv detection can be attempted safely.
    """
    if isinstance(path_or_bytes, (bytes, bytearray)):
        fd, temp_path = tempfile.mkstemp(suffix=".bin")
        os.close(fd)
        with open(temp_path, "wb") as handle:
            handle.write(bytes(path_or_bytes))
        return temp_path, temp_path, ".bin"

    file_path = os.fspath(path_or_bytes)
    return file_path, None, Path(file_path).suffix.lower()


def _read_data_source(path_or_bytes: DataSource):
    """Return the DuckDB column types detected in a CSV or Parquet source."""
    file_path, cleanup, ext = _materialize_data_source(path_or_bytes)
    file_path_literal = file_path.replace("'", "''")

    try:
        with duckdb.connect() as conn:
            if ext == ".parquet":
                rows = conn.execute(
                    f"DESCRIBE SELECT * FROM read_parquet('{file_path_literal}')"
                ).fetchall()
            elif ext == ".csv":
                rows = conn.execute(
                    f"DESCRIBE SELECT * FROM read_csv_auto('{file_path_literal}')"
                ).fetchall()
            else:
                try:
                    rows = conn.execute(
                        f"DESCRIBE SELECT * FROM read_parquet('{file_path_literal}')"
                    ).fetchall()
                except Exception as parquet_exc:
                    try:
                        rows = conn.execute(
                            f"DESCRIBE SELECT * FROM read_csv_auto('{file_path_literal}')"
                        ).fetchall()
                    except Exception as csv_exc:
                        raise ValueError(
                            "Unsupported or unreadable data source. "
                            "Use a .parquet/.csv file, or valid parquet/csv bytes."
                        ) from csv_exc
        return {str(r[0]): str(r[1]) for r in rows}
    finally:
        if cleanup:
            try:
                os.remove(cleanup)
            except FileNotFoundError:
                pass


def _cleanup_temp_path(temp_path: str | None) -> None:
    if not temp_path:
        return
    try:
        os.remove(temp_path)
    except FileNotFoundError:
        pass
