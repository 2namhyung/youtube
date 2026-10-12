"""Single-operator durable local store with immutable records and atomic CAS."""
import hashlib
import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def uid(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


class Gate(Exception):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def require(condition, code, message, status=422):
    if not condition:
        raise Gate(code, message, status)


def physical(path: Path, root: Path):
    path, root = path.absolute(), root.absolute()
    require(path.is_relative_to(root), "PATH_DENIED", "Storage path escaped its root")
    for parent in [path, *path.parents]:
        if parent.exists():
            st = parent.lstat()
            require(not parent.is_symlink() and not (getattr(st, "st_file_attributes", 0) & 0x400),
                    "PATH_DENIED", "Reparse points and symlinks are not accepted")
        if parent == root:
            break
    require(path.resolve().is_relative_to(root.resolve()), "PATH_DENIED", "Unexpected realpath")
    return path


class Store:
    def __init__(self, root):
        self.root = Path(root).absolute()
        self.root.mkdir(parents=True, exist_ok=True)
        physical(self.root, self.root)
        for folder in ("blobs", "work", "exports"):
            (self.root / folder).mkdir(exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.root / "shopping.sqlite3", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        migration = Path(__file__).parents[2] / "migrations" / "001_initial.sql"
        self.db.executescript(migration.read_text(encoding="utf-8"))

    @contextmanager
    def transaction(self):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield self.db
                self.db.commit()
            except BaseException:
                self.db.rollback()
                raise

    def rows(self, sql, params=()):
        with self.lock:
            return [dict(row) for row in self.db.execute(sql, params).fetchall()]

    def record(self, kind, data, project_id=None, connection=None):
        record_id = uid(kind)
        args = (record_id, kind, project_id, canonical(data), digest(data), now())
        if connection is not None:
            connection.execute("INSERT INTO records VALUES(?,?,?,?,?,?)", args)
        else:
            with self.transaction() as db:
                db.execute("INSERT INTO records VALUES(?,?,?,?,?,?)", args)
        return record_id

    def get(self, record_id, kind=None):
        rows = self.rows("SELECT * FROM records WHERE id=?", (record_id,))
        require(rows, "NOT_FOUND", "Record not found", 404)
        row = rows[0]
        require(kind is None or row["kind"] == kind, "WRONG_RECORD_TYPE", "Wrong record type")
        row["data"] = json.loads(row.pop("json"))
        require(digest(row["data"]) == row["hash"], "RECORD_DRIFT", "Stored record changed")
        return row

    def list(self, kind, project_id=None):
        sql = "SELECT id FROM records WHERE kind=?"
        args = [kind]
        if project_id:
            sql += " AND project_id=?"
            args.append(project_id)
        return [self.get(r["id"]) for r in self.rows(sql + " ORDER BY created_at DESC", args)]

    def project(self, project_id):
        rows = self.rows("SELECT * FROM projects WHERE id=?", (project_id,))
        require(rows, "NOT_FOUND", "Project not found", 404)
        row = rows[0]
        row["state"] = json.loads(row.pop("json"))
        return row

    def check_revision(self, project_id, revision):
        p = self.project(project_id)
        require(p["revision"] == revision, "REVISION_CONFLICT", "Project changed; refresh before continuing", 409)
        return p

    def blob(self, blob_id):
        record = self.get(blob_id, "blob")["data"]
        path = physical(self.root / record["key"], self.root)
        require(path.is_file(), "MISSING_BLOB", "Registered file is missing")
        require(path.stat().st_size == record["bytes"] and self.file_hash(path) == record["sha256"],
                "BLOB_DRIFT", "Registered file bytes changed")
        return path

    @staticmethod
    def file_hash(path):
        with open(path, "rb") as source:
            return hashlib.file_digest(source, "sha256").hexdigest()

    def put_file(self, path, name=None):
        sha = self.file_hash(path)
        suffix = Path(name or path.name).suffix.lower()
        key = f"blobs/{sha[:2]}/{sha}{suffix}"
        target = physical(self.root / key, self.root)
        target.parent.mkdir(exist_ok=True)
        if not target.exists():
            import shutil
            temp = target.with_name(uid("tmp") + suffix)
            shutil.copyfile(path, temp)
            os.replace(temp, target)
        require(self.file_hash(target) == sha, "BLOB_DRIFT", "Existing blob is corrupt")
        return self.record("blob", {"key": key, "sha256": sha, "bytes": target.stat().st_size,
                                    "name": name or path.name})

    def revoked(self, record_id):
        return bool(self.rows("SELECT id FROM revocations WHERE subject_id=?", (record_id,)))

    def close(self):
        self.db.close()
