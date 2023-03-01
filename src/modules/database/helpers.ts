import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { PaginateOptions, PaginateReturn } from './types';

/**
 * 分页函数
 * @param qb queryBuilder实例
 * @param options 分页选项
 */
export const paginate = async <E extends ObjectLiteral>(
  qb: SelectQueryBuilder<E>,
  options: PaginateOptions,
): Promise<PaginateReturn<E>> => {
  const start = options.page > 0 ? options.page - 1 : 0;
  const totalItems = await qb.getCount();
  qb.take(options.limit).skip(start * options.limit);
  const items = await qb.getMany();
  const totalPages = Math.ceil(totalItems / options.limit);
  // TODO
  // 1. 这个地方应该是忽略了 totalItems 为 0 的情况
  //    按照目前的计算方式 totalItems 为 0 时会得出 remainder = itemCount = options.limit 的结果

  // 2. 为什么 itemCount 不直接取 items.length 而是要这样来回计算。
  const remainder = totalItems % options.limit !== 0 ? totalItems % options.limit : options.limit;
  const itemCount = options.page < totalPages ? options.limit : remainder;

  return {
    items,
    meta: {
      totalItems,
      itemCount,
      perPage: options.limit,
      totalPages,
      currentPage: options.page,
    },
  };
};
