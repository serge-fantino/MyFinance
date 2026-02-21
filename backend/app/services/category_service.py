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
        """Return categories as a nested tree with hierarchy level info."""
        all_cats = await self.list_categories(user)
        cat_map = {c.id: {
            "id": c.id,
            "name": c.name,
            "parent_id": c.parent_id,
            "icon": c.icon,
            "color": c.color,
            "is_system": c.is_system,
            "level": c.level,
            "level1_id": c.level1_id,
            "level2_id": c.level2_id,
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
        # Compute hierarchy level fields
        level, level1_id, level2_id = await self._compute_level_fields(data.parent_id)

        category = Category(
            user_id=user.id,
            name=data.name,
            parent_id=data.parent_id,
            icon=data.icon,
            color=data.color,
            is_system=False,
            level=level,
            level1_id=level1_id,
            level2_id=level2_id,
        )
        self.db.add(category)
        await self.db.flush()
        await self.db.refresh(category)

        # Self-referencing fields need the ID from flush
        needs_update = False
        if level == 1:
            category.level1_id = category.id
            needs_update = True
        if level == 2:
            category.level2_id = category.id
            needs_update = True
        if needs_update:
            await self.db.flush()

        return {
            "id": category.id,
            "name": category.name,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "color": category.color,
            "is_system": category.is_system,
            "level": category.level,
            "level1_id": category.level1_id,
            "level2_id": category.level2_id,
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

        # Recompute level fields if parent changed
        if "parent_id" in update_data:
            level, level1_id, level2_id = await self._compute_level_fields(category.parent_id)
            category.level = level
            category.level1_id = level1_id if level > 1 else category.id
            category.level2_id = level2_id

        await self.db.flush()
        await self.db.refresh(category)
        return {
            "id": category.id,
            "name": category.name,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "color": category.color,
            "is_system": category.is_system,
            "level": category.level,
            "level1_id": category.level1_id,
            "level2_id": category.level2_id,
            "children": [],
        }

    async def delete_category(self, category_id: int, user: User) -> None:
        """Delete a user category. System categories cannot be deleted."""
        category = await self._get_user_category(category_id, user)
        await self.db.delete(category)
        await self.db.flush()

    async def _compute_level_fields(
        self, parent_id: int | None
    ) -> tuple[int, int | None, int | None]:
        """Compute (level, level1_id, level2_id) based on parent.

        - Root (no parent): level=1, level1_id set to self.id after insert, level2_id=None
        - Child of root: level=2, level1_id=parent_id, level2_id=self.id after insert
        - Deeper: level=parent.level+1, level1_id=parent.level1_id, level2_id=parent.level2_id
        """
        if parent_id is None:
            return (1, None, None)  # level1_id set to self.id after flush

        parent = await self.db.get(Category, parent_id)
        if not parent:
            return (1, None, None)

        level = parent.level + 1
        if level == 2:
            # Direct child of root
            return (2, parent.id, None)  # level2_id set to self.id after flush
        else:
            # Deeper nesting: inherit parent's level1/level2
            return (level, parent.level1_id, parent.level2_id or parent.id)

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
