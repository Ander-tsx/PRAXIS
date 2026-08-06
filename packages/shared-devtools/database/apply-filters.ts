export const applyFilters = (qb, filters) => {
  if (filters) {
    if (filters.search) {
      qb.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.createdFrom) {
      qb.andWhere('user.createdAt >= :createdFrom', {
        createdFrom: filters.createdFrom,
      });
    }

    if (filters.createdTo) {
      qb.andWhere('user.createdAt <= :createdTo', {
        createdTo: filters.createdTo,
      });
    }
  }
};
