import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateBoardDto,
  UpdateBoardDto,
  DeleteBoardDto,
  FindOneBoardDto,
} from '@praxis/contracts';
import { BoardsService } from './boards.service';

@Controller()
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @MessagePattern({ cmd: 'board_create' })
  createBoard(@Payload() dto: CreateBoardDto) {
    return this.boardsService.createBoard(dto);
  }

  @MessagePattern({ cmd: 'board_find_all' })
  findBoards(@Payload() dto: { workspaceId: string }) {
    return this.boardsService.findBoards(dto.workspaceId);
  }

  @MessagePattern({ cmd: 'board_find_one' })
  findOneBoard(@Payload() dto: FindOneBoardDto) {
    return this.boardsService.findOneBoard(dto.id);
  }

  @MessagePattern({ cmd: 'board_update' })
  updateBoard(@Payload() dto: UpdateBoardDto) {
    return this.boardsService.updateBoard(dto);
  }

  @MessagePattern({ cmd: 'board_delete' })
  deleteBoard(@Payload() dto: DeleteBoardDto) {
    return this.boardsService.deleteBoard(dto.id);
  }
}
