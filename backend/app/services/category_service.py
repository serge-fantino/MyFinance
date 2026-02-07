"""Category management service."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.user import User


class CategoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_categories(self, user: User) -> list[Category]:
        """List all categories: system-wide + user's custom ones."""
        result = await self.db.execute(
            select(Category)
            .where(
                or_(
                    Category.is_system.is_(True),
                    Category.user_id == user.id,
                )
            )
            .order_by(Category.parent_id.nulls_first(), Category.name)
        )
        return list(result.scalars().all())

    async def get_category_tree(self, user: User) -> list[dict]:
        """Return categories as a nested tree."""
        all_cats = await self.list_categories(user)
        cat_map = {c.id: {
            "id": c.id,
            "name": c.name,
            "parent_id": c.parent_id,
            "icon": c.icon,
            "color": c.color,
            "is_system": c.is_system,
            "children": [],
        } for c in all_cats}

        tree = []
        for cat in cat_map.values():
            if cat["parent_id"] and cat["parent_id"] in cat_map:
                cat_map[cat["parent_id"]]["children"].append(cat)
            else:
                tree.append(cat)
        return tree
