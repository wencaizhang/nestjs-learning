import { PostEntity } from './entities';

/**
 * like 代表使用传统的 mysql like关键字实现全文搜索
 * against 代表使用 mysql 的 against 实现
 */
export type SearchType = 'like' | 'against' | 'elastic';

export interface ContentConfig {
  searchType?: SearchType;
}

export type PostSearchBody = Pick<ClassToPlain<PostEntity>, 'title' | 'body' | 'summary'> & {
  categories: string;
};
