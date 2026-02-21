export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  level: number;
  level1_id: number | null;
  level2_id: number | null;
  children: Category[] | null;
}
