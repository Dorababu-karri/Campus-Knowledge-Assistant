"""
Document Permissions and RBAC Configuration
Campus Knowledge Assistant - Milestone 7.2 & Milestone 9
"""

import os
import json
from typing import Dict, Any

# Path for persisting dynamically registered document permissions
PERMISSIONS_FILE = os.path.join(os.path.dirname(__file__), "data", "document_permissions.json")

# Default institutional document classification mapping
DEFAULT_DOCUMENT_PERMISSIONS: Dict[str, Dict[str, str]] = {
    "Attendance-Policy.pdf": {"access_level": "public", "department": "all"},
    "Student-Code-of-Conduct-1.pdf": {"access_level": "public", "department": "all"},
    "refund-policy.pdf": {"access_level": "public", "department": "all"},
    "central-library-policy.pdf": {"access_level": "public", "department": "all"},
    "Academic-Policy.pdf": {"access_level": "student", "department": "all"},
    "information-technology-policy.pdf": {"access_level": "student", "department": "all"},
    "placement-facilitation-policy.pdf": {"access_level": "student", "department": "all"},
    "student-support-services-policy.pdf": {"access_level": "student", "department": "all"},
    "13.-Examination-Evaluation-Manual-2022-23.pdf": {"access_level": "staff", "department": "academics"},
    "sample_policy.txt": {"access_level": "student", "department": "all"},
}

VALID_ROLES = {"public", "student", "staff", "admin"}
VALID_ACCESS_LEVELS = {"public", "student", "staff", "admin"}
VALID_DEPARTMENTS = {"all", "general", "academics", "engineering", "business", "law", "admissions"}

def load_all_permissions() -> Dict[str, Dict[str, str]]:
    """Loads default permissions merged with any dynamically added permissions."""
    all_perms = dict(DEFAULT_DOCUMENT_PERMISSIONS)
    if os.path.exists(PERMISSIONS_FILE):
        try:
            with open(PERMISSIONS_FILE, "r", encoding="utf-8") as f:
                custom = json.load(f)
                if isinstance(custom, dict):
                    all_perms.update(custom)
        except Exception as e:
            print(f"Warning: Failed to load dynamic permissions from {PERMISSIONS_FILE}: {e}")
    return all_perms

def register_document_permissions(filename: str, access_level: str, department: str = "all") -> Dict[str, str]:
    """
    Dynamically registers or updates permission classification for a document.
    Persists to data/document_permissions.json and updates in-memory mapping.
    """
    if not filename or not isinstance(filename, str):
        raise ValueError("Filename must be a non-empty string.")
    
    clean_level = access_level.strip().lower()
    clean_dept = (department or "all").strip().lower()

    if clean_level not in VALID_ACCESS_LEVELS:
        raise ValueError(f"Invalid access level '{clean_level}'. Must be one of {VALID_ACCESS_LEVELS}")

    # Read current custom permissions
    current_custom: Dict[str, Dict[str, str]] = {}
    if os.path.exists(PERMISSIONS_FILE):
        try:
            with open(PERMISSIONS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    current_custom = loaded
        except Exception:
            current_custom = {}

    perm_entry = {"access_level": clean_level, "department": clean_dept}
    current_custom[filename] = perm_entry
    DEFAULT_DOCUMENT_PERMISSIONS[filename] = perm_entry

    os.makedirs(os.path.dirname(PERMISSIONS_FILE), exist_ok=True)
    with open(PERMISSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(current_custom, f, indent=2)

    return perm_entry

def remove_document_permissions(filename: str) -> bool:
    """Removes a document from custom permissions if present."""
    if os.path.exists(PERMISSIONS_FILE):
        try:
            with open(PERMISSIONS_FILE, "r", encoding="utf-8") as f:
                current_custom = json.load(f)
            if filename in current_custom:
                del current_custom[filename]
                with open(PERMISSIONS_FILE, "w", encoding="utf-8") as f:
                    json.dump(current_custom, f, indent=2)
                return True
        except Exception:
            pass
    return False

def get_document_permissions(filename: str) -> Dict[str, str]:
    """
    Returns permission dictionary containing 'access_level' and 'department' for a document.
    Raises ValueError if filename is unknown, ensuring unknown documents fail safely.
    """
    all_perms = load_all_permissions()
    if not filename or filename not in all_perms:
        raise ValueError(
            f"Unknown document '{filename}'. Cannot assign permissions silently. Manual classification required."
        )
    return all_perms[filename]
