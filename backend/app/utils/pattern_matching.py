"""Shared pattern matching logic for classification rules and clusters."""

import re


def matches_pattern(label: str, pattern: str, match_type: str) -> bool:
    """Check if a transaction label matches a rule pattern.

    match_type:
    - exact: label equals pattern (case-insensitive)
    - starts_with: label starts with pattern (case-insensitive)
    - regex: pattern is a regex (case-insensitive)
    - contains: pattern substring in label. Use " % " to require multiple
      substrings (A % B = label contains A AND B)
    """
    label_lower = label.lower()
    pattern_stripped = pattern.strip()

    if match_type == "regex":
        try:
            return bool(re.search(pattern_stripped, label, re.IGNORECASE))
        except re.error:
            return False

    if match_type == "exact":
        return label_lower == pattern_stripped.lower()
    if match_type == "starts_with":
        return label_lower.startswith(pattern_stripped.lower())

    # contains (default) — support "A % B" for multiple (all must be in label)
    if " % " in pattern_stripped:
        parts = [p.strip() for p in pattern_stripped.split("%") if p.strip()]
        return all(p.lower() in label_lower for p in parts)
    return pattern_stripped.lower() in label_lower
