/**
 * @description 传入CustomRepository装饰器的metadata数据标识
 */
export const CUSTOM_REPOSITORY_METADATA = 'CUSTOM_REPOSITORY_METADATA';

/**
 * 软删除数据查询类型
 *
 * ALL: 包含已软删除和未软删除的数据（同时查询正常数据和回收站中的数据）
 *
 * ONLY: 只包含软删除的数据 （只查询回收站中的数据）
 *
 * NONE: 只包含未软删除的数据 （只查询正常数据）
 */
export enum SelectTrashMode {
  ALL = 'all',
  ONLY = 'only',
  NONE = 'none',
}
