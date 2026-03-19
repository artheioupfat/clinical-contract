"""
Query backends for clinical-contract.

Each backend exposes:
    run_query(sql, parquet_path, table_name) -> int
"""
from __future__ import annotations

import os
import tempfile
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

        temp_path: str | None = None
        parquet_source = parquet_path

        if isinstance(parquet_path, (bytes, bytearray)):
            fd, temp_path = tempfile.mkstemp(suffix=".parquet")
            os.close(fd)
            with open(temp_path, "wb") as handle:
                handle.write(bytes(parquet_path))
            parquet_source = temp_path

        with duckdb.connect() as conn:
            try:
                parquet_path_literal = str(parquet_source).replace("'", "''")
                conn.execute(
                    f"CREATE VIEW {_quote_identifier(table_name)} AS "
                    f"SELECT * FROM read_parquet('{parquet_path_literal}')",
                )
                result = conn.execute(sql).fetchone()
            finally:
                if temp_path:
                    try:
                        os.remove(temp_path)
                    except FileNotFoundError:
                        pass
        return _result_to_int(result)

BACKENDS: dict[str, type[BaseBackend]] = {
    "duckdb": DuckDBBackend,
}


def available_backends() -> list[str]:
    return [name for name, cls in BACKENDS.items() if cls.is_available()]


def auto_backend() -> BaseBackend:
    cls = BACKENDS["duckdb"]
    if cls.is_available():
        return cls()

    missing_by_backend = ", ".join(
        f"{name}({', '.join(cls.missing_packages())})"
        for name, cls in BACKENDS.items()
    )
    raise ImportError(
        "Aucun backend disponible. "
        f"Détails: {missing_by_backend}. "
        "Installe avec: pip install \"clinical-contract[duckdb]\""
    )
