export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  children: Category[] | null;
}
