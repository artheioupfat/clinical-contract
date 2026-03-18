"""
Query backends for clinical-contract.

Each backend exposes:
    run_query(sql, parquet_path, table_name) -> int
"""
from __future__ import annotations

import io
from abc import ABC, abstractmethod


class BaseBackend(ABC):
    @abstractmethod
    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        ...


class DuckDBBackend(BaseBackend):
    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        import duckdb

        conn = duckdb.connect()
        if isinstance(parquet_path, (bytes, bytearray)):
            import pyarrow.parquet as pq
            table = pq.read_table(io.BytesIO(parquet_path))
            conn.register(table_name, table)
        else:
            conn.execute(
                f"CREATE VIEW {table_name} AS "
                f"SELECT * FROM read_parquet('{parquet_path}')"
            )
        result = conn.execute(sql).fetchone()
        conn.close()
        return int(result[0]) if result else 0


class PyArrowBackend(BaseBackend):
    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        import pyarrow.parquet as pq
        import duckdb

        if isinstance(parquet_path, (bytes, bytearray)):
            table = pq.read_table(io.BytesIO(parquet_path))
        else:
            table = pq.read_table(parquet_path)

        conn = duckdb.connect()
        conn.register(table_name, table)
        result = conn.execute(sql).fetchone()
        conn.close()
        return int(result[0]) if result else 0


class PolarsBackend(BaseBackend):
    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        import polars as pl
        import duckdb

        if isinstance(parquet_path, (bytes, bytearray)):
            df = pl.read_parquet(io.BytesIO(parquet_path))
        else:
            df = pl.read_parquet(parquet_path)

        conn = duckdb.connect()
        conn.register(table_name, df.to_arrow())
        result = conn.execute(sql).fetchone()
        conn.close()
        return int(result[0]) if result else 0


def auto_backend() -> BaseBackend:
    for cls, pkg in [
        (DuckDBBackend,  "duckdb"),
        (PolarsBackend,  "polars"),
        (PyArrowBackend, "pyarrow"),
    ]:
        try:
            __import__(pkg)
            return cls()
        except ImportError:
            continue
    raise ImportError(
        "Aucun backend disponible. "
        "Installe au moins l'un de : duckdb, polars, pyarrow"
    )


BACKENDS: dict[str, type[BaseBackend]] = {
    "duckdb":  DuckDBBackend,
    "polars":  PolarsBackend,
    "pyarrow": PyArrowBackend,
}
