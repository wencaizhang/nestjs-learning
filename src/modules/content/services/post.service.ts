import { InternalServerErrorException } from '@nestjs/common';

import { isArray, isFunction, isNil, omit } from 'lodash';

import { In, IsNull, Not, SelectQueryBuilder, EntityNotFoundError } from 'typeorm';

import { SelectTrashMode } from '@/modules/database/constants';
import { manualPaginate, paginate } from '@/modules/database/helpers';
import { QueryHook } from '@/modules/database/types';

import { PostOrderType } from '../constants';

import { CreatePostDto, QueryPostDto, UpdatePostDto } from '../dtos/post.dto';
import { PostEntity } from '../entities/post.entity';
import { CategoryRepository } from '../repositories/category.repository';
import { PostRepository } from '../repositories/post.repository';

import { SearchType } from '../types';

import { CategoryService } from './category.service';
import { SearchService } from './search.service';

// 文章查询接口
type FindParams = {
  [key in keyof Omit<QueryPostDto, 'limit' | 'page'>]: QueryPostDto[key];
};

/**
 * 文章数据操作
 */
export class PostService {
  constructor(
    protected repository: PostRepository,
    protected categoryRepository: CategoryRepository,
    protected categoryService: CategoryService,
    protected searchService?: SearchService,
    protected search_type: SearchType = 'against',
  ) {}

  /**
   * 获取分页数据
   * @param options 分页选项
   * @param callback 添加额外的查询
   */
  async paginate(options: QueryPostDto, callback?: QueryHook<PostEntity>) {
    if (!isNil(this.searchService) && !isNil(options.search) && this.search_type === 'elastic') {
      const { search: text, page, limit } = options;
      const results = await this.searchService.search(text);
      const ids = results.map((result) => result.id);
      const posts = ids.length <= 0 ? [] : await this.repository.find({ where: { id: In(ids) } });
      return manualPaginate({ page, limit }, posts);
    }
    const qb = await this.buildListQuery(this.repository.buildBaseQB(), options, callback);
    return paginate(qb, options);
  }

  /**
   * 查询单篇文章
   * @param id
   * @param callback 添加额外的查询
   */
  async detail(id: string, callback?: QueryHook<PostEntity>) {
    let qb = this.repository.buildBaseQB();
    qb.where(`post.id = :id`, { id });
    qb = !isNil(callback) && isFunction(callback) ? await callback(qb) : qb;
    const item = await qb.getOne();
    if (!item) throw new EntityNotFoundError(PostEntity, `The post ${id} not exists!`);
    return item;
  }

  /**
   * 创建文章
   * @param data
   */
  async create(data: CreatePostDto) {
    const createPostDto = {
      ...data,
      // 文章所属分类
      categories: isArray(data.categories)
        ? await this.categoryRepository.findBy({
            id: In(data.categories),
          })
        : [],
    };
    const item = await this.repository.save(createPostDto);
    if (!isNil(this.searchService)) {
      try {
        await this.searchService.create(item);
      } catch (err) {
        throw new InternalServerErrorException(err);
      }
    }

    return this.detail(item.id);
  }

  /**
   * 更新文章
   * @param data
   */
  async update(data: UpdatePostDto) {
    const post = await this.detail(data.id);
    if (isArray(data.categories)) {
      // 更新文章所属分类
      await this.repository
        .createQueryBuilder('post')
        .relation(PostEntity, 'categories')
        .of(post)
        .addAndRemove(data.categories, post.categories ?? []);
    }
    await this.repository.update(data.id, omit(data, ['id', 'categories']));
    if (!isNil(this.searchService)) {
      try {
        await this.searchService.update(post);
      } catch (err) {
        throw new InternalServerErrorException(err);
      }
    }
    return this.detail(data.id);
  }

  /**
   * 删除文章
   * @param ids
   * @param trash
   */
  async delete(ids: string[], trash?: boolean) {
    const items = await this.repository.find({
      where: { id: In(ids) } as any,
      withDeleted: true,
    });
    let result: PostEntity[] = [];
    if (trash) {
      const directs = items.filter((item) => !isNil(item.deletedAt));
      const softs = items.filter((item) => isNil(item.deletedAt));
      result = [
        ...(await this.repository.remove(directs)),
        ...(await this.repository.softRemove(softs)),
      ];
    } else {
      result = await this.repository.remove(items);
    }
    if (!isNil(this.searchService)) {
      try {
        for (const id of ids) await this.searchService.remove(id);
      } catch (err) {
        throw new InternalServerErrorException(err);
      }
    }
    return result;
  }

  /**
   * 恢复文章
   * @param ids
   */
  async restore(ids: string[]) {
    const items = await this.repository.find({
      where: { id: In(ids) } as any,
      withDeleted: true,
    });
    const trasheds = items.filter((item) => !isNil(item));
    if (trasheds.length < 0) return [];
    await this.repository.restore(trasheds.map((item) => item.id));
    if (!isNil(this.searchService)) {
      try {
        for (const id of trasheds) await this.searchService.create(id);
      } catch (err) {
        throw new InternalServerErrorException(err);
      }
    }
    const qb = await this.buildListQuery(this.repository.buildBaseQB(), {}, async (qbuilder) =>
      qbuilder.andWhereInIds(trasheds),
    );
    return qb.getMany();
  }

  /**
   * 构建文章列表查询器
   * @param qb 初始查询构造器
   * @param options 排查分页选项后的查询选项
   * @param callback 添加额外的查询
   */
  protected async buildListQuery(
    qb: SelectQueryBuilder<PostEntity>,
    options: FindParams,
    callback?: QueryHook<PostEntity>,
  ) {
    const { category, orderBy, isPublished, search, trashed = SelectTrashMode.NONE } = options;
    // 是否查询回收站
    if (trashed === SelectTrashMode.ALL || trashed === SelectTrashMode.ONLY) {
      qb.withDeleted();
      if (trashed === SelectTrashMode.ONLY) qb.where(`post.deletedAt is not null`);
    }
    if (typeof isPublished === 'boolean') {
      isPublished
        ? qb.where({
            publishedAt: Not(IsNull()),
          })
        : qb.where({
            publishedAt: IsNull(),
          });
    }
    if (!isNil(search)) {
      if (this.search_type === 'like') {
        qb.andWhere('title LIKE :search', { search: `%${search}%` })
          .orWhere('body LIKE :search', { search: `%${search}%` })
          .orWhere('summary LIKE :search', { search: `%${search}%` })
          .orWhere('categories.name LIKE :search', {
            search: `%${search}%`,
          });
      } else {
        qb.andWhere('MATCH(title) AGAINST (:search IN BOOLEAN MODE)', {
          search: `${search}*`,
        })
          .orWhere('MATCH(body) AGAINST (:search IN BOOLEAN MODE)', {
            search: `${search}*`,
          })
          .orWhere('MATCH(summary) AGAINST (:search IN BOOLEAN MODE)', {
            search: `${search}*`,
          })
          .orWhere('MATCH(categories.name) AGAINST (:search IN BOOLEAN MODE)', {
            search: `${search}*`,
          });
      }
    }
    this.queryOrderBy(qb, orderBy);
    if (category) {
      await this.queryByCategory(category, qb);
    }
    if (callback) return callback(qb);
    return qb;
  }

  /**
   *  对文章进行排序的Query构建
   * @param qb
   * @param orderBy 排序方式
   */
  protected queryOrderBy(qb: SelectQueryBuilder<PostEntity>, orderBy?: PostOrderType) {
    switch (orderBy) {
      case PostOrderType.CREATED:
        return qb.orderBy('post.createdAt', 'DESC');
      case PostOrderType.UPDATED:
        return qb.orderBy('post.updatedAt', 'DESC');
      case PostOrderType.PUBLISHED:
        return qb.orderBy('post.publishedAt', 'DESC');
      case PostOrderType.COMMENTCOUNT:
        return qb.orderBy('commentCount', 'DESC');
      case PostOrderType.CUSTOM:
        return qb.orderBy('customOrder', 'DESC');
      default:
        return qb
          .orderBy('post.createdAt', 'DESC')
          .addOrderBy('post.updatedAt', 'DESC')
          .addOrderBy('post.publishedAt', 'DESC')
          .addOrderBy('commentCount', 'DESC');
    }
  }

  /**
   * 查询出分类及其后代分类下的所有文章的Query构建
   * @param id
   * @param qb
   */
  protected async queryByCategory(id: string, qb: SelectQueryBuilder<PostEntity>) {
    const root = await this.categoryService.detail(id);
    const tree = await this.categoryRepository.findDescendantsTree(root);
    const flatDes = await this.categoryRepository.toFlatTrees(tree.children);
    const ids = [tree.id, ...flatDes.map((item) => item.id)];
    return qb.where('categories.id IN (:...ids)', {
      ids,
    });
  }
}
