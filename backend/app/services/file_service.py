"""File repository service for storing imported files locally."""

import hashlib
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings


class FileService:
    """Manages the local file repository for imported files.

    Directory structure:
        {data_dir}/imports/{user_id}/{YYYY}/{MM}/{import_log_id}_{filename}.zip
    """

    def __init__(self) -> None:
        self.base_dir = Path(settings.data_dir)

    def _imports_dir(self, user_id: int) -> Path:
        now = datetime.now(timezone.utc)
        return self.base_dir / "imports" / str(user_id) / now.strftime("%Y") / now.strftime("%m")

    def store_file(self, user_id: int, import_log_id: int, filename: str, content: bytes) -> str:
        """Save file to disk, compressed as ZIP. Returns the relative path from data_dir."""
        directory = self._imports_dir(user_id)
        directory.mkdir(parents=True, exist_ok=True)

        # Sanitize filename (keep only safe chars)
        safe_name = "".join(c for c in filename if c.isalnum() or c in "._-")[:100] or "upload"
        target = directory / f"{import_log_id}_{safe_name}.zip"

        # Write a single-file ZIP archive containing the original file
        with zipfile.ZipFile(target, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(filename, content)

        return str(target.relative_to(self.base_dir))

    def get_full_path(self, relative_path: str) -> Path:
        """Resolve full path from relative path."""
        return self.base_dir / relative_path

    def read_file(self, relative_path: str) -> bytes:
        """Read original file content from relative path (handles ZIP compression)."""
        full_path = self.get_full_path(relative_path)

        # New files are stored as ZIP archives; older ones may be plain files.
        if full_path.suffix == ".zip":
            with zipfile.ZipFile(full_path, mode="r") as zf:
                infos = zf.infolist()
                if not infos:
                    return b""
                with zf.open(infos[0], mode="r") as f:
                    return f.read()

        return full_path.read_bytes()

    def file_exists(self, relative_path: str) -> bool:
        """Check if a file exists."""
        return self.get_full_path(relative_path).exists()

    def delete_file(self, relative_path: str) -> None:
        """Delete a stored file if it exists."""
        full_path = self.get_full_path(relative_path)
        try:
            full_path.unlink()
        except FileNotFoundError:
            # Already gone; nothing to do.
            return

    @staticmethod
    def compute_hash(content: bytes) -> str:
        """SHA-256 hash of file content."""
        return hashlib.sha256(content).hexdigest()
