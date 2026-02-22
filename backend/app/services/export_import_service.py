"""Export/import of categories and classification rules in YAML format.

Enables recreating accounts, sharing rules, backup/restore.
"""

from datetime import datetime, timezone
from typing import Any

import structlog
import yaml
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.classification_rule import ClassificationRule
from app.models.user import User

logger = structlog.get_logger()

EXPORT_VERSION = 1


def _build_category_path(cat: Category, id_to_cat: dict[int, Category]) -> str:
    """Build full path like 'Alimentation > Restaurants' from root to category."""
    parts = [cat.name]
    current = cat
    while current.parent_id and current.parent_id in id_to_cat:
        current = id_to_cat[current.parent_id]
        parts.insert(0, current.name)
    return " > ".join(parts)


def _build_parent_path(cat: Category, id_to_cat: dict[int, Category]) -> str | None:
    """Build parent path for a category (null for root)."""
    if not cat.parent_id or cat.parent_id not in id_to_cat:
        return None
    return _build_category_path(id_to_cat[cat.parent_id], id_to_cat)


async def export_categories_and_rules(db: AsyncSession, user: User) -> str:
    """Export user categories and rules as YAML string."""
    # Load user categories (not system)
    cat_result = await db.execute(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.parent_id.nulls_first(), Category.name)
    )
    user_cats = list(cat_result.scalars().all())

    # Load all categories (system + user) for path resolution
    all_cats_result = await db.execute(
        select(Category).where(
            or_(Category.is_system.is_(True), Category.user_id == user.id)
        )
    )
    all_cats = list(all_cats_result.scalars().all())
    id_to_cat = {c.id: c for c in all_cats}

    # Export categories (parent = level1 path when under system cat, e.g. "Dépenses" or "Revenu")
    categories_export = []
    for cat in user_cats:
        parent_path = _build_parent_path(cat, id_to_cat)
        categories_export.append({
            "name": cat.name,
            "parent": parent_path,
            "icon": cat.icon,
            "color": cat.color,
        })

    # Load rules
    rules_result = await db.execute(
        select(ClassificationRule)
        .where(ClassificationRule.user_id == user.id)
        .order_by(ClassificationRule.priority.desc())
    )
    rules = list(rules_result.scalars().all())

    # Export rules with category path
    rules_export = []
    for rule in rules:
        cat = id_to_cat.get(rule.category_id)
        category_path = _build_category_path(cat, id_to_cat) if cat else f"#unknown-{rule.category_id}"
        rules_export.append({
            "pattern": rule.pattern,
            "match_type": rule.match_type,
            "category": category_path,
            "custom_label": rule.custom_label,
            "priority": rule.priority,
        })

    data = {
        "version": EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "categories": categories_export,
        "rules": rules_export,
    }
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


async def import_categories_and_rules(
    db: AsyncSession,
    user: User,
    yaml_content: str,
    *,
    merge: bool = True,
) -> dict[str, Any]:
    """Import categories and rules from YAML. Returns stats."""

    def safe_load():
        try:
            return yaml.safe_load(yaml_content)
        except yaml.YAMLError as e:
            raise ValueError(f"YAML invalide : {e}") from e

    data = safe_load()
    if not isinstance(data, dict):
        raise ValueError("Le fichier YAML doit contenir un objet (dict).")

    version = data.get("version", 1)
    if version > EXPORT_VERSION:
        raise ValueError(f"Version {version} non supportée. Max: {EXPORT_VERSION}")

    categories_data = data.get("categories") or []
    rules_data = data.get("rules") or []

    if not isinstance(categories_data, list):
        raise ValueError("'categories' doit être une liste.")
    if not isinstance(rules_data, list):
        raise ValueError("'rules' doit être une liste.")

    # Sort categories so parents are created before children
    def _category_depth(item: dict) -> int:
        parent = item.get("parent")
        return (parent.count(" > ") + 1) if parent else 0

    categories_data = sorted(categories_data, key=lambda x: _category_depth(x) if isinstance(x, dict) else 0)

    # Build path -> id for existing categories (system + user)
    all_cats_result = await db.execute(
        select(Category).where(
            or_(Category.is_system.is_(True), Category.user_id == user.id)
        )
    )
    all_cats: list[Category] = list(all_cats_result.scalars().all())
    id_to_cat = {c.id: c for c in all_cats}

    def get_path(cat: Category) -> str:
        return _build_category_path(cat, id_to_cat)

    path_to_id: dict[str, int] = {}
    for cat in all_cats:
        path_to_id[get_path(cat)] = cat.id

    created_cats = 0
    created_rules = 0
    skipped_rules = 0

    from app.schemas.category import CategoryCreate
    from app.services.category_service import CategoryService

    cat_svc = CategoryService(db)

    # Create categories in order (parent before children)
    for item in categories_data:
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or "").strip()
        if not name:
            continue
        parent_path = item.get("parent")
        parent_id = path_to_id.get(parent_path) if parent_path else None

        # Check if already exists (same path)
        full_path = f"{parent_path} > {name}" if parent_path else name
        if full_path in path_to_id and merge:
            continue

        create_data = CategoryCreate(
            name=name,
            parent_id=parent_id,
            icon=item.get("icon") if isinstance(item.get("icon"), str) else None,
            color=item.get("color") if isinstance(item.get("color"), str) else None,
        )
        try:
            created = await cat_svc.create_category(create_data, user)
            full_path = f"{parent_path} > {name}" if parent_path else name
            path_to_id[full_path] = created["id"]
            new_cat = await db.get(Category, created["id"])
            if new_cat:
                all_cats.append(new_cat)
                id_to_cat[new_cat.id] = new_cat
            created_cats += 1
        except Exception as e:
            logger.warning("import_category_failed", name=name, parent_path=parent_path, error=str(e))

    # Create rules
    for item in rules_data:
        if not isinstance(item, dict):
            continue
        pattern = item.get("pattern")
        if not pattern or not isinstance(pattern, str):
            continue
        category_path = item.get("category")
        if not category_path or not isinstance(category_path, str):
            skipped_rules += 1
            continue

        category_id = path_to_id.get(category_path.strip())
        if not category_id:
            logger.warning("import_rule_unknown_category", path=category_path, pattern=pattern)
            skipped_rules += 1
            continue

        match_type = item.get("match_type") or "contains"
        if match_type not in ("contains", "exact", "starts_with", "regex"):
            match_type = "contains"

        custom_label = item.get("custom_label")
        if custom_label is not None and not isinstance(custom_label, str):
            custom_label = None

        priority = item.get("priority", 0)
        if not isinstance(priority, (int, float)):
            priority = 0

        if merge:
            # Check if rule with same pattern already exists
            existing = await db.execute(
                select(ClassificationRule).where(
                    ClassificationRule.user_id == user.id,
                    ClassificationRule.pattern == pattern.strip(),
                )
            )
            if existing.scalar_one_or_none():
                continue

        rule = ClassificationRule(
            user_id=user.id,
            pattern=pattern.strip(),
            match_type=match_type,
            category_id=category_id,
            custom_label=custom_label.strip() if custom_label else None,
            priority=int(priority),
            is_active=True,
            created_by="manual",
        )
        db.add(rule)
        await db.flush()
        created_rules += 1

    return {
        "categories_created": created_cats,
        "rules_created": created_rules,
        "rules_skipped": skipped_rules,
    }
