import { Exclude, Expose, Type } from 'class-transformer';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  Tree,
  TreeChildren,
  TreeParent,
} from 'typeorm';

import { BaseEntity } from '@/modules/database/base';

import { PostEntity } from './post.entity';
/**
 * 树形嵌套分类
 */
@Exclude()
@Tree('materialized-path')
@Entity('content_categories')
export class CategoryEntity extends BaseEntity {
  @Expose()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Expose()
  @Column({ comment: '分类名称' })
  @Index({ fulltext: true })
  name: string;

  @Expose({ groups: ['category-tree', 'category-list', 'category-detail'] })
  @Column({ comment: '分类排序', default: 0 })
  customOrder: number;

  @Expose({ groups: ['category-list'] })
  depth = 0;

  @Expose({ groups: ['category-detail', 'category-list'] })
  @Type(() => CategoryEntity)
  @TreeParent({ onDelete: 'NO ACTION' })
  parent: CategoryEntity | null;

  @Expose({ groups: ['category-tree'] })
  @Type(() => CategoryEntity)
  @TreeChildren({ cascade: true })
  children: CategoryEntity[];

  @ManyToMany((type) => PostEntity, (post) => post.categories)
  posts: PostEntity[];

  @Expose()
  @Type(() => Date)
  @DeleteDateColumn({
    comment: '删除时间',
  })
  deletedAt: Date;
}
