"""Category management service."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.category import Category
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryUpdate


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

    async def create_category(self, data: CategoryCreate, user: User) -> dict:
        """Create a custom user category."""
        category = Category(
            user_id=user.id,
            name=data.name,
            parent_id=data.parent_id,
            icon=data.icon,
            color=data.color,
            is_system=False,
        )
        self.db.add(category)
        await self.db.flush()
        await self.db.refresh(category)
        return {
            "id": category.id,
            "name": category.name,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "color": category.color,
            "is_system": category.is_system,
            "children": [],
        }

    async def update_category(
        self, category_id: int, data: CategoryUpdate, user: User
    ) -> dict:
        """Update a user category. System categories cannot be modified."""
        category = await self._get_user_category(category_id, user)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(category, key, value)
        await self.db.flush()
        await self.db.refresh(category)
        return {
            "id": category.id,
            "name": category.name,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "color": category.color,
            "is_system": category.is_system,
            "children": [],
        }

    async def delete_category(self, category_id: int, user: User) -> None:
        """Delete a user category. System categories cannot be deleted."""
        category = await self._get_user_category(category_id, user)
        await self.db.delete(category)
        await self.db.flush()

    async def _get_user_category(self, category_id: int, user: User) -> Category:
        """Fetch a category and verify it belongs to the user (not system)."""
        result = await self.db.execute(
            select(Category).where(Category.id == category_id)
        )
        category = result.scalar_one_or_none()
        if not category:
            raise NotFoundError("Category")
        if category.is_system:
            raise ForbiddenError("Les catégories système ne peuvent pas être modifiées.")
        if category.user_id != user.id:
            raise ForbiddenError()
        return category
