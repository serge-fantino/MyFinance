"""Category schemas."""

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    parent_id: int | None = None
    icon: str | None = None
    color: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    parent_id: int | None = None
    icon: str | None = None
    color: str | None = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None
    icon: str | None
    color: str | None
    is_system: bool
    children: list["CategoryResponse"] | None = None

    model_config = {"from_attributes": True}
