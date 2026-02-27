"""File repository service for storing imported files locally."""

import hashlib
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings


class FileService:
    """Manages the local file repository for imported files.

    Directory structure:
        {data_dir}/imports/{user_id}/{YYYY}/{MM}/{import_log_id}_{filename}
    """

    def __init__(self) -> None:
        self.base_dir = Path(settings.data_dir)

    def _imports_dir(self, user_id: int) -> Path:
        now = datetime.now(timezone.utc)
        return self.base_dir / "imports" / str(user_id) / now.strftime("%Y") / now.strftime("%m")

    def store_file(self, user_id: int, import_log_id: int, filename: str, content: bytes) -> str:
        """Save file to disk. Returns the relative path from data_dir."""
        directory = self._imports_dir(user_id)
        directory.mkdir(parents=True, exist_ok=True)

        # Sanitize filename (keep only safe chars)
        safe_name = "".join(c for c in filename if c.isalnum() or c in "._-")[:100] or "upload"
        target = directory / f"{import_log_id}_{safe_name}"

        target.write_bytes(content)
        return str(target.relative_to(self.base_dir))

    def get_full_path(self, relative_path: str) -> Path:
        """Resolve full path from relative path."""
        return self.base_dir / relative_path

    def read_file(self, relative_path: str) -> bytes:
        """Read file content from relative path."""
        full_path = self.get_full_path(relative_path)
        return full_path.read_bytes()

    def file_exists(self, relative_path: str) -> bool:
        """Check if a file exists."""
        return self.get_full_path(relative_path).exists()

    @staticmethod
    def compute_hash(content: bytes) -> str:
        """SHA-256 hash of file content."""
        return hashlib.sha256(content).hexdigest()
