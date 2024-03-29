import { Controller, Get, Query, SerializeOptions } from '@nestjs/common';

import { BaseController } from '@/modules/restful/base';
import { Crud } from '@/modules/restful/decorators';

import { CreateCommentDto, QueryCommentDto, QueryCommentTreeDto } from '../dtos';
import { CommentService } from '../services';

@Crud({
  id: 'post',
  enabled: ['list', 'detail', 'store', 'delete'],
  dtos: {
    store: CreateCommentDto,
    list: QueryCommentDto,
  },
})
@Controller('comments')
export class CommentController extends BaseController<CommentService> {
  constructor(protected service: CommentService) {
    super(service);
  }

  @Get('tree')
  @SerializeOptions({ groups: ['comment-tree'] })
  async tree(
    @Query()
    query: QueryCommentTreeDto,
  ) {
    return this.service.findTrees(query);
  }
}
