export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPagination(page: number, perPage: number, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  };
}

export function paginate<T>(data: T[], page: number, perPage: number, total: number): Paginated<T> {
  return { data, meta: buildPagination(page, perPage, total) };
}

export function skipTake(page: number, perPage: number) {
  return { skip: (page - 1) * perPage, take: perPage };
}
