# Root conftest.py — adds the project root to sys.path so that
# `from backend.app import ...` imports work when running pytest from here.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
