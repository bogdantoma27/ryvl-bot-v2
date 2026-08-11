import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
REQUIREMENTS = ROOT / "requirements.txt"


def _running_inside_venv() -> bool:
    return sys.prefix != getattr(sys, "base_prefix", sys.prefix)


def _reexec_with_venv_if_available() -> None:
    if _running_inside_venv():
        return
    if not VENV_PYTHON.exists():
        return
    subprocess.run([str(VENV_PYTHON), str(ROOT / "main.py")], check=True)
    raise SystemExit(0)


def _ensure_uvicorn() -> None:
    try:
        import uvicorn  # noqa: F401
        return
    except ModuleNotFoundError:
        print("[bootstrap] uvicorn is missing. Installing dependencies from requirements.txt...")

    if not REQUIREMENTS.exists():
        raise RuntimeError("requirements.txt was not found.")

    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(REQUIREMENTS)],
        check=True,
        cwd=str(ROOT),
    )


def main() -> None:
    _reexec_with_venv_if_available()
    _ensure_uvicorn()

    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("RELOAD", "true").strip().lower() in {"1", "true", "yes", "on"}

    uvicorn.run("app.main:app", host=host, port=port, reload=reload_enabled)


if __name__ == "__main__":
    main()
