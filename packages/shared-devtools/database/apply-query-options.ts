export function applyQueryOptions<T>({
  qb,
  query,
  allowedSortFields,
  defaultSortBy = 'createdAt',
}: ApplyQueryOptions<T>) {
  const page = query?.page ?? 1;
  const limit = query?.limit ?? 10;

  const sortBy = allowedSortFields.includes(query?.sortBy ?? '') ? query?.sortBy : defaultSortBy;

  const sortOrder: SortOrder = query?.sortOrder ?? SortOrder.DESC;

  qb.orderBy(`${qb.alias}.${sortBy}`, sortOrder);

  qb.skip((page - 1) * limit);
  qb.take(limit);

  return qb;
}
