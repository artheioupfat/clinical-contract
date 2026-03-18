"""
Query backends for clinical-contract.

Each backend exposes:
    run_query(sql, parquet_path, table_name) -> int
"""
from __future__ import annotations

import io
from abc import ABC, abstractmethod
from importlib.util import find_spec
from typing import ClassVar


class BaseBackend(ABC):
    backend_name: ClassVar[str]
    required_packages: ClassVar[tuple[str, ...]] = ()
    install_extra: ClassVar[str]

    @classmethod
    def missing_packages(cls) -> tuple[str, ...]:
        return tuple(pkg for pkg in cls.required_packages if find_spec(pkg) is None)

    @classmethod
    def is_available(cls) -> bool:
        return len(cls.missing_packages()) == 0

    @classmethod
    def ensure_available(cls) -> None:
        missing = cls.missing_packages()
        if not missing:
            return
        packages = ", ".join(missing)
        raise ImportError(
            f"Backend '{cls.backend_name}' indisponible. "
            f"Dépendances manquantes : {packages}. "
            f"Installe avec: pip install \"clinical-contract[{cls.install_extra}]\""
        )

    @abstractmethod
    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        ...


def _quote_identifier(identifier: str) -> str:
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def _result_to_int(result: tuple | None) -> int:
    if not result or result[0] is None:
        return 0
    return int(result[0])


class DuckDBBackend(BaseBackend):
    backend_name = "duckdb"
    required_packages = ("duckdb",)
    install_extra = "duckdb"

    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        self.ensure_available()
        import duckdb

        with duckdb.connect() as conn:
            if isinstance(parquet_path, (bytes, bytearray)):
                try:
                    import pyarrow.parquet as pq
                except ImportError as exc:
                    raise ImportError(
                        "Lecture de parquet en bytes avec backend duckdb: pyarrow requis. "
                        "Installe avec: pip install \"clinical-contract[all]\""
                    ) from exc
                table = pq.read_table(io.BytesIO(parquet_path))
                conn.register(table_name, table)
            else:
                conn.execute(
                    f"CREATE VIEW {_quote_identifier(table_name)} AS "
                    "SELECT * FROM read_parquet(?)",
                    [str(parquet_path)],
                )
            result = conn.execute(sql).fetchone()
        return _result_to_int(result)


class PyArrowBackend(BaseBackend):
    backend_name = "pyarrow"
    required_packages = ("duckdb", "pyarrow")
    install_extra = "pyarrow"

    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        self.ensure_available()
        import pyarrow.parquet as pq
        import duckdb

        if isinstance(parquet_path, (bytes, bytearray)):
            table = pq.read_table(io.BytesIO(parquet_path))
        else:
            table = pq.read_table(parquet_path)

        with duckdb.connect() as conn:
            conn.register(table_name, table)
            result = conn.execute(sql).fetchone()
        return _result_to_int(result)


class PolarsBackend(BaseBackend):
    backend_name = "polars"
    required_packages = ("duckdb", "polars", "pyarrow")
    install_extra = "polars"

    def run_query(self, sql: str, parquet_path: str | bytes, table_name: str) -> int:
        self.ensure_available()
        import polars as pl
        import duckdb

        if isinstance(parquet_path, (bytes, bytearray)):
            df = pl.read_parquet(io.BytesIO(parquet_path))
        else:
            df = pl.read_parquet(parquet_path)

        with duckdb.connect() as conn:
            conn.register(table_name, df.to_arrow())
            result = conn.execute(sql).fetchone()
        return _result_to_int(result)


BACKENDS: dict[str, type[BaseBackend]] = {
    "duckdb": DuckDBBackend,
    "polars": PolarsBackend,
    "pyarrow": PyArrowBackend,
}


def available_backends() -> list[str]:
    return [name for name, cls in BACKENDS.items() if cls.is_available()]


def auto_backend() -> BaseBackend:
    for name in ("duckdb", "polars", "pyarrow"):
        cls = BACKENDS[name]
        if cls.is_available():
            return cls()

    missing_by_backend = ", ".join(
        f"{name}({', '.join(cls.missing_packages())})"
        for name, cls in BACKENDS.items()
    )
    raise ImportError(
        "Aucun backend disponible. "
        f"Détails: {missing_by_backend}. "
        "Installe au moins l'un de: clinical-contract[duckdb], "
        "clinical-contract[polars], clinical-contract[pyarrow]"
    )
