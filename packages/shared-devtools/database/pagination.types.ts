interface ApplyQueryOptions<T extends ObjectLiteral> {
  qb: SelectQueryBuilder<T>;
  query?: QueryOptionsDto;
  allowedSortFields: string[];
  defaultSortBy?: string;
}
